import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { AuthService } from '../src/modules/auth/auth.service.js';
import { JwtService } from '@nestjs/jwt';
import { Role, InvoiceStatus, CertificateStatus } from '@prisma/client';
import { EnrollmentsService } from '../src/modules/enrollments/enrollments.service.js';

describe('Security and Concurrency (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let enrollmentsService: EnrollmentsService;
  
  let _user1Token: string;
  let user1Id: string;
  let user2Token: string;
  let user2Id: string;
  let managerToken: string;
  let managerId: string;
  
  let user1InvoiceId: string;
  let _user1CertId: string;
  let programId: string;
  let myBatchId: string;
  let otherBatchId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    prisma = app.get(PrismaService);
    enrollmentsService = app.get(EnrollmentsService);
    await app.init();
    
    // Setup users
    const nonce = Date.now();
    const [u1, u2, m1] = await Promise.all([
      prisma.user.create({ data: { email: `u1-${nonce}@test.com`, role: Role.USER } }),
      prisma.user.create({ data: { email: `u2-${nonce}@test.com`, role: Role.USER } }),
      prisma.user.create({ data: { email: `m1-${nonce}@test.com`, role: Role.MANAGER } })
    ]);
    user1Id = u1.id;
    user2Id = u2.id;
    managerId = m1.id;
    
    // Mock tokens
    const authService = app.get(AuthService);
    const t1 = await authService.createDeviceSession(u1.id, u1.role, `hash1-${nonce}`);
    const t2 = await authService.createDeviceSession(u2.id, u2.role, `hash2-${nonce}`);
    const tm = await authService.createDeviceSession(m1.id, m1.role, `hash3-${nonce}`);
    
    const jwt = app.get(JwtService);
    _user1Token = jwt.sign({ sub: u1.id, email: u1.email, role: u1.role, sessionId: t1 });
    user2Token = jwt.sign({ sub: u2.id, email: u2.email, role: u2.role, sessionId: t2 });
    managerToken = jwt.sign({ sub: m1.id, email: m1.email, role: m1.role, sessionId: tm });
    
    // Setup data
    const p1 = await prisma.program.create({ data: { title: 'P1', slug: `p1-${nonce}`, price: 100 } });
    programId = p1.id;
    
    const b1 = await prisma.batch.create({ data: { name: 'B1', programId: p1.id, managerId: m1.id, capacity: 10, startDate: new Date() } });
    myBatchId = b1.id;
    
    const b2 = await prisma.batch.create({ data: { name: 'B2', programId: p1.id, capacity: 10, startDate: new Date() } });
    otherBatchId = b2.id;
    
    const e1 = await prisma.enrolment.create({ data: { userId: u1.id, batchId: b1.id, programId: p1.id, status: 'ACTIVE' } });
    
    const pay1 = await prisma.payment.create({
      data: {
        enrolmentId: e1.id,
        stripeSessionId: `mock-stripe-${nonce}`,
        amount: 100,
        currency: 'USD',
        status: 'succeeded',
      }
    });

    const inv1 = await prisma.invoice.create({
      data: {
        paymentId: pay1.id,
        amount: 100,
        status: InvoiceStatus.ISSUED,
        invoiceNumber: `INV-${nonce}`
      }
    });
    user1InvoiceId = inv1.id;
    
    const cert1 = await prisma.certificate.create({
      data: {
        certificateNumber: `CERT-${nonce}`,
        enrolmentId: e1.id,
        issuedAt: new Date(),
        pdfUrl: 'http://example.com/cert.pdf',
        status: CertificateStatus.APPROVED
      }
    });
    _user1CertId = cert1.id;
  }, 30000);

  afterAll(async () => {
    // Only remove what this suite created.
    try {
      const userIds = [user1Id, user2Id, managerId].filter(Boolean);
      if (userIds.length > 0 || programId) {
        const mine = programId
          ? { OR: [{ userId: { in: userIds } }, { programId }] }
          : { userId: { in: userIds } };
        await prisma.certificate.deleteMany({ where: { enrolment: mine } }).catch(() => {});
        if (user1InvoiceId) await prisma.invoice.deleteMany({ where: { id: user1InvoiceId } }).catch(() => {});
        await prisma.payment.deleteMany({ where: { enrolment: mine } }).catch(() => {});
        await prisma.enrolment.deleteMany({ where: mine }).catch(() => {});
        if (programId) {
          await prisma.batch.deleteMany({ where: { programId } }).catch(() => {});
          await prisma.program.deleteMany({ where: { id: programId } }).catch(() => {});
        }
        await prisma.userSession.deleteMany({ where: { userId: { in: userIds } } }).catch(() => {});
        await prisma.user.deleteMany({ where: { id: { in: userIds } } }).catch(() => {});
      }
    } finally {
      if (app) await app.close();
    }
  }, 30000);

  it('user2 cannot access user1 invoice', async () => {
    const res = await request(app.getHttpServer())
      .get('/invoices')
      .set('Authorization', `Bearer ${user2Token}`);
    // Non-admin user receives 403 Forbidden
    expect(res.status).toBe(403);
  });

  it('user2 cannot access user1 certificate via API', async () => {
    const res = await request(app.getHttpServer())
      .post('/certificates/request')
      .set('Authorization', `Bearer ${user2Token}`)
      .send({ batchId: myBatchId });
    // User2 is not enrolled in myBatchId
    expect([400, 404]).toContain(res.status);
  });

  it('manager cannot fetch a batch they do not manage', async () => {
    const res = await request(app.getHttpServer())
      .get(`/batches/${otherBatchId}`)
      .set('Authorization', `Bearer ${managerToken}`);
    expect(res.status).toBe(403);
    
    const res2 = await request(app.getHttpServer())
      .get(`/batches/${myBatchId}`)
      .set('Authorization', `Bearer ${managerToken}`);
    expect(res2.status).toBe(200);
  });

  it('concurrency: simultaneous mockCheckout creates only 1 enrolment', async () => {
    // Both user2 calls mockCheckout at same time for same program
    const promises = [
      enrollmentsService.mockCheckout(user2Id, programId),
      enrollmentsService.mockCheckout(user2Id, programId),
    ];
    
    const results = await Promise.allSettled(promises);
    
    // Find how many succeeded
    const successes = results.filter(r => r.status === 'fulfilled');
    expect(successes.length).toBeGreaterThan(0);
    
    // Wait for DB write just in case
    await new Promise(r => setTimeout(r, 100));
    
    // Check db count
    const enrolments = await prisma.enrolment.findMany({ where: { userId: user2Id, programId: programId } });
    expect(enrolments.length).toBe(1);
  }, 20000);
});
