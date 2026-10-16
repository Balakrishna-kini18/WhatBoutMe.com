import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ServiceUnavailableException } from '@nestjs/common';
import { HealthController } from './health.controller.js';

describe('HealthController (Keep-Alive & Database Warmup)', () => {
  let controller: HealthController;
  let mockPrisma: any;
  let mockHealthCheckService: any;
  let mockRedisService: any;

  beforeEach(() => {
    mockPrisma = {
      $queryRaw: vi.fn(),
    };

    mockHealthCheckService = {
      check: vi.fn(async (indicators: Array<() => Promise<any>>) => {
        const results = await Promise.all(indicators.map((fn) => fn()));
        return Object.assign({}, ...results);
      }),
    };

    mockRedisService = {
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
    it('runs comprehensive indicators for database and redis', async () => {
      mockPrisma.$queryRaw.mockResolvedValueOnce([{ '?column?': 1 }]);

      const res = (await controller.detailedCheck()) as any;

      expect(mockHealthCheckService.check).toHaveBeenCalledTimes(1);
      expect(res.database.status).toBe('up');
    });

    it('reports database down if query fails during detailed check', async () => {
      mockPrisma.$queryRaw.mockRejectedValueOnce(new Error('Connection terminated'));

      const res = (await controller.detailedCheck()) as any;

      expect(res.database.status).toBe('down');
      expect(res.database.error).toBe('Connection terminated');
    });
  });
});
