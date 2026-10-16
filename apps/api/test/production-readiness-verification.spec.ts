import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { CertificatesService } from '../src/modules/certificates/certificates.service.js';
import { InvoicesService } from '../src/modules/invoices/invoices.service.js';
import { ServerTimingMiddleware } from '../src/common/middleware/server-timing.middleware.js';
import { recordDbDuration, requestTimingStorage } from '../src/common/timing/server-timing.storage.js';
import { Role } from '@prisma/client';
import { ForbiddenException } from '@nestjs/common';
import fs from 'node:fs';
import path from 'node:path';

describe('Real-World Production Readiness & Multi-Role Verification', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // SUITE 1: Certificates Role-Based Cohort Scoping & Pagination
  // =========================================================================
  describe('Certificates Role Scoping & Pagination', () => {
    let service: CertificatesService;
    let prismaMock: any;

    beforeEach(() => {
      prismaMock = {
        certificate: {
          findMany: vi.fn(),
          findFirst: vi.fn(),
          findUnique: vi.fn(),
          create: vi.fn(),
          update: vi.fn(),
        },
        enrolment: {
          findUnique: vi.fn(),
        },
        auditLog: {
          create: vi.fn().mockResolvedValue({ id: 'audit-1' }),
        },
      };
      service = new CertificatesService(prismaMock, {} as any, {} as any);
    });

    it('Scenario 1A: SuperAdmin/Admin retrieves paginated certificates across all batches', async () => {
      const adminUser = { id: 'admin-1', role: Role.SUPER_ADMIN };
      prismaMock.certificate.findMany.mockResolvedValue([
        { id: 'cert-1', certificateNumber: 'WBM-2026-0001' },
        { id: 'cert-2', certificateNumber: 'WBM-2026-0002' },
      ]);

      const result = await service.findAll(adminUser, { page: 2, limit: 10 });

      expect(prismaMock.certificate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {}, // Admin has no cohort restriction
          skip: 10,
          take: 10,
          orderBy: { createdAt: 'desc' },
        })
      );
      expect(result).toHaveLength(2);
    });

    it('Scenario 1B: Manager only retrieves certificates for batches they manage or train', async () => {
      const managerUser = { id: 'mgr-42', role: Role.MANAGER };
      prismaMock.certificate.findMany.mockResolvedValue([
        { id: 'cert-10', certificateNumber: 'WBM-2026-0010' },
      ]);

      await service.findAll(managerUser, { page: 1, limit: 20 });

      expect(prismaMock.certificate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            enrolment: {
              batch: {
                OR: [
                  { managerId: 'mgr-42' },
                  { trainers: { some: { trainerId: 'mgr-42' } } },
                ],
              },
            },
          },
          skip: 0,
          take: 20,
        })
      );
    });

    it('Scenario 1C: Learner only retrieves certificates issued to their own userId', async () => {
      const learnerUser = { id: 'student-99', role: Role.USER };
      prismaMock.certificate.findMany.mockResolvedValue([]);

      await service.findAll(learnerUser);

      expect(prismaMock.certificate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            enrolment: { userId: 'student-99' },
          },
          skip: undefined,
          take: undefined, // Backward-compatible unpaginated call
        })
      );
    });
  });

  // =========================================================================
  // SUITE 2: Invoices Access Control & Anti-IDOR Security
  // =========================================================================
  describe('Invoices Security & Strict Role Scoping', () => {
    let service: InvoicesService;
    let prismaMock: any;

    beforeEach(() => {
      prismaMock = {
        invoice: {
          findMany: vi.fn(),
          findFirst: vi.fn(),
        },
      };
      service = new InvoicesService(prismaMock);
    });

    it('Scenario 2A: Strictly forbids Manager or Teacher from viewing financial invoices', async () => {
      const managerUser = { id: 'mgr-1', role: Role.MANAGER };
      const teacherUser = { id: 'teacher-1', role: Role.TEACHER };

      await expect(service.findAll(managerUser)).rejects.toThrow(ForbiddenException);
      await expect(service.findAll(teacherUser)).rejects.toThrow(ForbiddenException);
      expect(prismaMock.invoice.findMany).not.toHaveBeenCalled();
    });

    it('Scenario 2B: Enforces horizontal tenant isolation for Learners (cannot see other users invoices)', async () => {
      const learner = { id: 'student-1', role: Role.USER };
      prismaMock.invoice.findMany.mockResolvedValue([
        {
          id: 'inv-1',
          invoiceNumber: 'INV-2026-001',
          amount: 250,
          currency: 'USD',
          status: 'PAID',
          creditNoteId: null,
          createdAt: new Date(),
          payment: {
            enrolment: {
              user: { name: 'Alice', email: 'alice@example.com' },
            },
          },
        },
      ]);

      const result = await service.findAll(learner, { page: 1, limit: 15 });

      expect(prismaMock.invoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            payment: {
              enrolment: {
                userId: 'student-1',
              },
            },
          },
          skip: 0,
          take: 15,
        })
      );

      expect(result[0].client).toBe('Alice');
      expect(result[0].numericAmount).toBe(250);
      expect(result[0].amount).toBe('$250');
    });

    it('Scenario 2C: Admin accesses all invoices with query pagination and lean projections', async () => {
      const admin = { id: 'admin-1', role: Role.ADMIN };
      prismaMock.invoice.findMany.mockResolvedValue([]);

      await service.findAll(admin, { page: 3, limit: 25 });

      expect(prismaMock.invoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {},
          skip: 50, // (page 3 - 1) * 25
          take: 25,
        })
      );
    });
  });

  // =========================================================================
  // SUITE 3: Server-Timing Lifecycle & Error-Resilience
  // =========================================================================
  describe('Server-Timing Middleware Reliability & Error Scenarios', () => {
    let middleware: ServerTimingMiddleware;

    beforeEach(() => {
      middleware = new ServerTimingMiddleware();
    });

    it('Scenario 3A: Correctly formats Server-Timing header on normal HTTP response', () => {
      const headers = new Map<string, string>();
      const res = {
        getHeader: vi.fn((k) => headers.get(k) || null),
        setHeader: vi.fn((k, v) => headers.set(k, v)),
        end: vi.fn(),
      } as any;
      const req = { method: 'GET', url: '/api/v1/programs' } as any;

      middleware.use(req, res, () => {
        recordDbDuration(18.4);
        res.end();
      });

      const header = headers.get('Server-Timing');
      expect(header).toBeDefined();
      expect(header).toMatch(/db;dur=18\.4, total;dur=[\d.]+/);
    });

    it('Scenario 3B: When a database query fails or throws, DB duration is still recorded and header written', () => {
      const headers = new Map<string, string>();
      const res = {
        getHeader: vi.fn((k) => headers.get(k) || null),
        setHeader: vi.fn((k, v) => headers.set(k, v)),
        end: vi.fn(),
      } as any;
      const req = { method: 'POST', url: '/api/v1/enrollments' } as any;

      middleware.use(req, res, () => {
        // Simulate query timing in try...finally block around failing query
        const start = performance.now();
        try {
          throw new Error('P2002: Unique constraint failed');
        } catch {
          // Handled downstream
        } finally {
          recordDbDuration(35.5);
        }
        res.end();
      });

      const header = headers.get('Server-Timing');
      expect(header).toBeDefined();
      expect(header).toContain('db;dur=35.5');
    });

    it('Scenario 3C: Slow query (>300ms) logs structured warning', () => {
      const loggerSpy = vi.spyOn((middleware as any).logger, 'warn');
      const headers = new Map<string, string>();
      const res = {
        getHeader: vi.fn((k) => headers.get(k) || null),
        setHeader: vi.fn((k, v) => headers.set(k, v)),
        end: vi.fn(),
      } as any;
      const req = { method: 'GET', url: '/api/v1/heavy-analytics' } as any;

      middleware.use(req, res, () => {
        recordDbDuration(320);
        res.end();
      });

      expect(loggerSpy).toHaveBeenCalledTimes(1);
      expect(loggerSpy.mock.calls[0][0]).toContain('[Slow Endpoint Warning]');
      expect(loggerSpy.mock.calls[0][0]).toContain('db: 320ms');
    });
  });

  // =========================================================================
  // SUITE 4: Caddy Proxy Security Configuration Verification
  // =========================================================================
  describe('Caddyfile Security & Whitelist Verification', () => {
    it('Scenario 4A: Verifies Caddyfile strictly restricts port forwarding to approved ports', () => {
      const caddyPath = path.resolve(__dirname, '../../../Caddyfile');
      expect(fs.existsSync(caddyPath)).toBe(true);

      const content = fs.readFileSync(caddyPath, 'utf8');

      // Must explicitly handle allowed ports
      expect(content).toContain('query XTransformPort=3000');
      expect(content).toContain('query XTransformPort=3001');
      expect(content).toContain('query XTransformPort=3002');
      expect(content).toContain('query XTransformPort=3003');
      expect(content).toContain('query XTransformPort=4000');

      // Must block unauthorized port scanning with 403 Forbidden
      expect(content).toContain('@unauthorized_port query XTransformPort=*');
      expect(content).toContain('respond "Forbidden upstream port" 403');

      // Must NOT contain unescaped dynamic port reflection
      expect(content).not.toContain('reverse_proxy localhost:{query.XTransformPort}');
    });

    it('Scenario 4B: Verifies asset caching differentiation (immutable vs 1-day SWR)', () => {
      const caddyPath = path.resolve(__dirname, '../../../Caddyfile');
      const content = fs.readFileSync(caddyPath, 'utf8');

      // Hashed static Next.js assets must be immutable
      expect(content).toContain('path /_next/static/* /fonts/*');
      expect(content).toContain('Cache-Control "public, max-age=31536000, immutable"');

      // Editable brand & site assets must have 1-day TTL with SWR
      expect(content).toContain('path /brand/* /site/*');
      expect(content).toContain('Cache-Control "public, max-age=86400, stale-while-revalidate=604800"');
    });
  });
});
