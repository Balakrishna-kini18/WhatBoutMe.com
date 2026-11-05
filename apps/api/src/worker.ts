process.env.WORKER_MODE = 'true';

import './instrument.js'; // Must be first!
import http from 'http';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { Logger } from 'nestjs-pino';

async function bootstrap() {
  if (process.env.NODE_ENV === 'production' && process.env.PAYMENT_MODE === 'mock') {
    console.error('FATAL ERROR: Worker refuses to start with PAYMENT_MODE=mock in production');
    process.exit(1);
  }

  // Create a headless application context (no Express HTTP server)
  const app = await NestFactory.createApplicationContext(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();

  const logger = app.get(Logger);
  logger.log('BullMQ Background Worker initialized and waiting for jobs...');

  // Lightweight HTTP Health & Readiness probe for container orchestrators (Kubernetes / ECS / Railway)
  const healthPort = parseInt(process.env.WORKER_HEALTH_PORT || '4001', 10);
  let isShuttingDown = false;

  const healthServer = http.createServer((req, res) => {
    if (req.url === '/health' || req.url === '/ready' || req.url === '/') {
      if (isShuttingDown) {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'shutting_down', workerMode: true }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          status: 'ok',
          workerMode: true,
          uptimeSec: Math.floor(process.uptime()),
          timestamp: new Date().toISOString(),
        }),
      );
      return;
    }
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not Found' }));
  });

  healthServer.listen(healthPort, () => {
    logger.log(`Worker health and readiness probe listening on port ${healthPort}`);
  });

  // Graceful shutdown handling
  const shutdown = async (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    logger.log(`Received ${signal}, initiating graceful worker shutdown...`);

    healthServer.close(() => {
      logger.log('Worker health probe closed.');
    });

    try {
      await app.close();
      logger.log('Nest application context closed cleanly.');
      process.exit(0);
    } catch (err: any) {
      logger.error(`Error during worker shutdown: ${err?.message || err}`);
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

bootstrap().catch((err) => {
  console.error('Worker bootstrap failed:', err);
  process.exit(1);
});
