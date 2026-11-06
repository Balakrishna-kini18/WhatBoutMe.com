process.env.WORKER_MODE = 'true';

import './instrument.js'; // Must be first!
import http from 'http';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { Logger } from 'nestjs-pino';
import { RedisService } from './common/redis/redis.service.js';
import { assertPaymentConfig } from './common/config/payment.config.js';

export interface WorkerProbeResult {
  statusCode: number;
  body: Record<string, any>;
}

/**
 * Evaluates worker HTTP liveness (/health) and readiness (/ready) probes.
 * - /health (liveness): 200 OK if process is running and not shutting down; 503 if shutting down.
 * - /ready (readiness): 200 OK only if Redis is configured, reachable (PONG), and worker is not shutting down; 503 otherwise.
 */
export async function evaluateWorkerProbe(
  url: string | undefined,
  isShuttingDown: boolean,
  redisService?: Pick<RedisService, 'ping' | 'isConfigured' | 'isReady'>,
): Promise<WorkerProbeResult> {
  const path = (url || '/').split('?')[0];

  if (path !== '/health' && path !== '/ready' && path !== '/') {
    return {
      statusCode: 404,
      body: { error: 'Not Found' },
    };
  }

  if (isShuttingDown) {
    return {
      statusCode: 503,
      body: {
        status: 'shutting_down',
        workerMode: true,
        timestamp: new Date().toISOString(),
      },
    };
  }

  if (path === '/ready') {
    const isConfigured = redisService ? redisService.isConfigured() : Boolean(process.env.REDIS_URL || process.env.REDIS_HOST);
    if (!isConfigured) {
      return {
        statusCode: 503,
        body: {
          status: 'not_ready',
          workerMode: true,
          redis: 'disabled',
          reason: 'REDIS_URL or REDIS_HOST is not configured for worker',
          timestamp: new Date().toISOString(),
        },
      };
    }

    const isRedisHealthy = redisService ? await redisService.ping(1500) : false;
    if (!isRedisHealthy) {
      return {
        statusCode: 503,
        body: {
          status: 'not_ready',
          workerMode: true,
          redis: 'down',
          reason: 'Redis connection unavailable',
          timestamp: new Date().toISOString(),
        },
      };
    }

    return {
      statusCode: 200,
      body: {
        status: 'ready',
        workerMode: true,
        redis: 'up',
        uptimeSec: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
      },
    };
  }

  // Liveness check (/health or /)
  return {
    statusCode: 200,
    body: {
      status: 'ok',
      workerMode: true,
      redis: redisService?.isReady() ? 'up' : redisService?.isConfigured() ? 'reconnecting' : 'disabled',
      uptimeSec: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    },
  };
}

async function bootstrap() {
  assertPaymentConfig();

  // Create a headless application context (no Express HTTP server)
  const app = await NestFactory.createApplicationContext(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();

  const logger = app.get(Logger);
  const redisService = app.get(RedisService);
  logger.log('BullMQ Background Worker initialized and waiting for jobs...');

  // Lightweight HTTP Health & Readiness probe for container orchestrators (Kubernetes / ECS / Railway)
  const healthPort = parseInt(process.env.WORKER_HEALTH_PORT || '4001', 10);
  let isShuttingDown = false;

  const healthServer = http.createServer(async (req, res) => {
    try {
      const result = await evaluateWorkerProbe(req.url, isShuttingDown, redisService);
      res.writeHead(result.statusCode, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result.body));
    } catch (err: any) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          status: 'error',
          workerMode: true,
          error: err?.message || 'Probe check failed',
        }),
      );
    }
  });

  healthServer.listen(healthPort, () => {
    logger.log(`Worker health and readiness probe listening on port ${healthPort}`);
  });

  // Graceful shutdown handling
  const shutdown = async (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    logger.log(`Received ${signal}, initiating graceful worker shutdown...`);

    const forceExitTimer = setTimeout(() => {
      logger.error('Worker graceful shutdown timed out after 15s, forcing exit.');
      process.exit(1);
    }, 15000);
    if (typeof forceExitTimer.unref === 'function') {
      forceExitTimer.unref();
    }

    healthServer.close(() => {
      logger.log('Worker health probe closed.');
    });

    try {
      await app.close();
      clearTimeout(forceExitTimer);
      logger.log('Nest application context closed cleanly.');
      process.exit(0);
    } catch (err: any) {
      clearTimeout(forceExitTimer);
      logger.error(`Error during worker shutdown: ${err?.message || err}`);
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

if (process.env.NODE_ENV !== 'test') {
  bootstrap().catch((err) => {
    console.error('Worker bootstrap failed:', err);
    process.exit(1);
  });
}
