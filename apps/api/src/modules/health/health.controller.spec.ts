import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ServiceUnavailableException } from '@nestjs/common';
import { HealthController } from './health.controller.js';
import { evaluateWorkerProbe } from '../../worker.js';

describe('HealthController & Worker Readiness Probes', () => {
  let controller: HealthController;
  let mockPrisma: any;
  let mockHealthCheckService: any;
  let mockRedisService: any;

  beforeEach(() => {
    mockPrisma = {
      $queryRaw: vi.fn(),
      outboxEvent: {
        count: vi.fn().mockResolvedValue(0),
      },
    };

    mockHealthCheckService = {
      check: vi.fn(async (indicators: Array<() => Promise<any>>) => {
        const results = await Promise.all(indicators.map((fn) => fn()));
        return Object.assign({}, ...results);
      }),
    };

    mockRedisService = {
      isConfigured: vi.fn().mockReturnValue(true),
      isReady: vi.fn().mockReturnValue(true),
      ping: vi.fn().mockResolvedValue(true),
      getClient: vi.fn(() => ({
        status: 'ready',
        ping: vi.fn().mockResolvedValue('PONG'),
        connect: vi.fn().mockResolvedValue(undefined),
      })),
    };

    controller = new HealthController(
      mockHealthCheckService,
      mockPrisma,
      mockRedisService,
    );
  });

  describe('Lightweight Warmup & Keep-Alive Check: GET /api/health and /health', () => {
    it('executes SELECT 1 and returns healthy status with latency measurement', async () => {
      mockPrisma.$queryRaw.mockResolvedValueOnce([{ '?column?': 1 }]);

      const res = await controller.check();

      expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
      expect(res.status).toBe('ok');
      expect(res.database).toBe('connected');
      expect(typeof res.latencyMs).toBe('number');
      expect(res.latencyMs).toBeGreaterThanOrEqual(0);
      expect(res.info.database.status).toBe('up');
      expect(res.timestamp).toBeDefined();
    });

    it('throws ServiceUnavailableException (HTTP 503) when database connection fails or times out', async () => {
      const dbError = new Error('P2024: Timed out fetching a new connection from the connection pool');
      mockPrisma.$queryRaw.mockRejectedValueOnce(dbError);

      await expect(controller.check()).rejects.toThrow(ServiceUnavailableException);

      mockPrisma.$queryRaw.mockRejectedValueOnce(dbError);
      try {
        await controller.check();
      } catch (err: any) {
        expect(err).toBeInstanceOf(ServiceUnavailableException);
        const response = err.getResponse();
        expect(response.status).toBe('error');
        expect(response.database).toBe('disconnected');
        expect(response.error).toContain('Timed out fetching a new connection');
        expect(response.info.database.status).toBe('down');
      }
    });

    it('measures latency properly when query takes non-zero time', async () => {
      mockPrisma.$queryRaw.mockImplementationOnce(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return [{ '?column?': 1 }];
      });

      const res = await controller.check();
      expect(res.status).toBe('ok');
      expect(res.latencyMs).toBeGreaterThanOrEqual(5);
    });
  });

  describe('Detailed Diagnostics Check: GET /health/details', () => {
    it('runs comprehensive indicators for database, redis, and outbox', async () => {
      mockPrisma.$queryRaw.mockResolvedValueOnce([{ '?column?': 1 }]);

      const res = (await controller.detailedCheck()) as any;

      expect(mockHealthCheckService.check).toHaveBeenCalledTimes(1);
      expect(res.database.status).toBe('up');
      expect(res.redis.status).toBe('up');
      expect(res.outbox).toEqual({
        status: 'up',
        pending: 0,
        leased: 0,
        retryableFailed: 0,
        terminalFailed: 0,
      });
    });

    it('reports database down if query fails during detailed check', async () => {
      mockPrisma.$queryRaw.mockRejectedValueOnce(new Error('Connection terminated'));

      const res = (await controller.detailedCheck()) as any;

      expect(res.database.status).toBe('down');
      expect(res.database.error).toBe('Connection terminated');
    });

    it('distinguishes Redis disabled vs down (never falsely reports up when Redis ping fails)', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);

      // Case 1: Redis disabled by configuration
      mockRedisService.isConfigured.mockReturnValueOnce(false);
      const disabledRes = (await controller.detailedCheck()) as any;
      expect(disabledRes.redis.status).toBe('disabled');

      // Case 2: Redis configured but unreachable -> must report 'down', NOT 'up'
      mockRedisService.isConfigured.mockReturnValueOnce(true);
      mockRedisService.getClient.mockReturnValueOnce({
        status: 'close',
        connect: vi.fn().mockRejectedValue(new Error('ECONNREFUSED')),
        ping: vi.fn().mockRejectedValue(new Error('Connection is closed.')),
      });
      const downRes = (await controller.detailedCheck()) as any;
      expect(downRes.redis.status).toBe('down');
      expect(downRes.redis.error).toContain('Connection is closed');
    });
  });

  describe('Worker Liveness (/health) and Readiness (/ready) Probes', () => {
    it('returns 200 ready on /ready when Redis is configured and ping succeeds', async () => {
      const res = await evaluateWorkerProbe('/ready', false, {
        isConfigured: () => true,
        isReady: () => true,
        ping: vi.fn().mockResolvedValue(true),
      });
      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe('ready');
      expect(res.body.redis).toBe('up');
    });

    it('returns 503 not_ready on /ready when Redis is unavailable', async () => {
      const res = await evaluateWorkerProbe('/ready', false, {
        isConfigured: () => true,
        isReady: () => false,
        ping: vi.fn().mockResolvedValue(false),
      });
      expect(res.statusCode).toBe(503);
      expect(res.body.status).toBe('not_ready');
      expect(res.body.redis).toBe('down');
    });

    it('returns 503 shutting_down when worker is terminating', async () => {
      const res = await evaluateWorkerProbe('/health', true, {
        isConfigured: () => true,
        isReady: () => true,
        ping: vi.fn().mockResolvedValue(true),
      });
      expect(res.statusCode).toBe(503);
      expect(res.body.status).toBe('shutting_down');
    });
  });
});
