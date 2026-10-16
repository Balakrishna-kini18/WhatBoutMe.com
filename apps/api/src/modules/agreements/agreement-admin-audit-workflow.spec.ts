import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  AgreementStatus,
  ContentStatus,
  EnrolmentStatus,
  Role,
} from '@prisma/client';
import { AgreementsService } from './agreements.service.js';
import { PaymentWebhookController } from '../enrollments/payment.webhook.controller.js';
import {
  SignedRecordsTab,
  SignedPaymentStatusFilter,
} from './dto/query-signed-agreements.dto.js';

describe('WhatBoutMe Agreement Administration & Enrollment Audit Suite', () => {
  let agreementsService: AgreementsService;
  let paymentWebhookController: PaymentWebhookController;
  let prismaMock: any;
  let cacheHelperMock: any;
  let emailServiceMock: any;

  const adminUser = {
    id: 'admin-1',
    sub: 'admin-1',
    role: Role.ADMIN,
    email: 'admin@whatboutme.com',
  };

  const managerUser = {
    id: 'mgr-1',
    sub: 'mgr-1',
    role: Role.MANAGER,
    email: 'manager@whatboutme.com',
  };

  const otherManagerUser = {
    id: 'mgr-2',
    sub: 'mgr-2',
    role: Role.MANAGER,
    email: 'other.manager@whatboutme.com',
  };

  const learnerA = {
    id: 'learner-a',
    sub: 'learner-a',
    role: Role.USER,
    name: 'Alice Learner',
    email: 'alice@example.com',
  };

  const learnerB = {
    id: 'learner-b',
    sub: 'learner-b',
    role: Role.USER,
    name: 'Bob Learner',
    email: 'bob@example.com',
  };

  const programLeadership = {
    id: 'prog-leadership',
    title: 'Executive Leadership Track',
    slug: 'exec-leadership',
    price: 499,
  };

  const programDesign = {
    id: 'prog-design',
    title: 'Product Design Systems',
    slug: 'product-design',
    price: 399,
  };

  const sharedDefaultTemplate = {
    id: 'tpl-shared-default',
    programId: null,
    title: 'Standard Platform Agreement [Shared Default]',
    description: 'Shared platform default agreement for unassigned courses',
    program: null,
    versions: [
      {
        id: 'ver-shared-v1',
        templateId: 'tpl-shared-default',
        version: 'v1.0',
        content: 'Universal terms, code of conduct, and intellectual property.',
        status: ContentStatus.PUBLISHED,
        publishedAt: new Date('2026-01-01'),
      },
    ],
  };

  const programSpecificTemplate = {
    id: 'tpl-leadership-specific',
    programId: programLeadership.id,
    title: 'Executive Leadership Tailored Agreement',
    description: 'Program specific agreement with leadership confidentiality clause',
    program: programLeadership,
    versions: [
      {
        id: 'ver-lead-v2',
        templateId: 'tpl-leadership-specific',
        version: 'v2.0',
        content: 'Leadership specific terms and executive coaching NDA.',
        status: ContentStatus.PUBLISHED,
        publishedAt: new Date('2026-02-01'),
      },
    ],
  };

  beforeEach(() => {
    cacheHelperMock = {
      invalidateNamespace: vi.fn().mockResolvedValue(undefined),
      invalidateKey: vi.fn().mockResolvedValue(undefined),
    };

    emailServiceMock = {
      sendTemplateEmail: vi.fn().mockResolvedValue(true),
    };

    prismaMock = {
      agreementTemplate: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
      },
      agreementTemplateVersion: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
      },
      signedAgreement: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
      enrolment: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      payment: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
      invoice: {
        create: vi.fn(),
      },
      user: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({ id: 'audit-1' }),
        findMany: vi.fn().mockResolvedValue([]),
      },
      program: {
        findUnique: vi.fn(),
      },
      $transaction: vi.fn(async (cb) => {
        if (typeof cb === 'function') {
          return cb(prismaMock);
        }
        return Promise.all(cb);
      }),
    };

    agreementsService = new AgreementsService(
      prismaMock,
      emailServiceMock,
      cacheHelperMock,
    );

    paymentWebhookController = new PaymentWebhookController(
      prismaMock,
      cacheHelperMock,
      emailServiceMock,
    );
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. SEPARATE SIGNING FROM COMPLETED ENROLLMENT RECORDS
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Pillar 1: Separate signing from completed enrollment records', () => {
    it('persists signed agreement evidence immediately while enrolment status remains PENDING_PAYMENT', async () => {
      const enrolmentPending = {
        id: 'enrol-pending-1',
        userId: learnerA.id,
        programId: programLeadership.id,
        status: EnrolmentStatus.PENDING_PAYMENT,
        signedAgreement: null,
      };

      prismaMock.enrolment.findUnique.mockResolvedValue(enrolmentPending);
      prismaMock.user.findUnique.mockResolvedValue(learnerA);
      prismaMock.agreementTemplate.findUnique.mockResolvedValue(programSpecificTemplate);
      prismaMock.agreementTemplate.findFirst.mockResolvedValue(programSpecificTemplate);
      prismaMock.agreementTemplateVersion.findFirst.mockResolvedValue(
        programSpecificTemplate.versions[0],
      );

      const createdSignedRecord = {
        id: 'signed-rec-1',
        enrolmentId: enrolmentPending.id,
        userId: learnerA.id,
        programId: programLeadership.id,
        templateId: programSpecificTemplate.id,
        versionId: 'ver-lead-v2',
        templateVersion: 'v2.0',
        consentVersion: 'v2.0',
        consentGiven: true,
        consentTimestamp: new Date(),
        typedName: 'Alice Learner',
        drawnSignature: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA',
        signatureType: 'DRAWN',
        signerIp: '192.168.1.10',
        status: AgreementStatus.SIGNED,
        signedAt: new Date(),
        version: programSpecificTemplate.versions[0],
        template: programSpecificTemplate,
      };

      prismaMock.signedAgreement.create.mockResolvedValue(createdSignedRecord);

      const result = await agreementsService.signAgreement(
        {
          enrolmentId: enrolmentPending.id,
          consentGiven: true,
          typedName: 'Alice Learner',
          signatureData: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA',
          signatureType: 'DRAWN',
        },
        learnerA,
        '192.168.1.10',
        'Mozilla/5.0',
      );

      expect(result.id).toBe('signed-rec-1');
      expect(result.status).toBe(AgreementStatus.SIGNED);
      expect(result.typedName).toBe('Alice Learner');
      expect(result.templateVersion).toBe('v2.0');

      // Crucial verification: enrolment is NOT transitioned to ACTIVE when signing a PENDING_PAYMENT checkout
      expect(prismaMock.enrolment.update).not.toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: EnrolmentStatus.ACTIVE } }),
      );
    });

    it('defaults admin view to COMPLETED tab (only paid/active signers), isolating PENDING_PAYMENT signers', async () => {
      prismaMock.agreementTemplate.findUnique.mockResolvedValue(sharedDefaultTemplate);

      // Counts query: 2 completed, 1 pending payment, 3 total
      prismaMock.signedAgreement.count
        .mockResolvedValueOnce(2) // completedCount
        .mockResolvedValueOnce(1) // pendingPaymentCount
        .mockResolvedValueOnce(3); // allCount

      // Filtered findMany returns only the 2 completed records by default
      const completedRecords = [
        {
          id: 'signed-1',
          userId: 'user-1',
          templateId: sharedDefaultTemplate.id,
          enrolment: {
            status: EnrolmentStatus.ACTIVE,
            payments: [{ status: 'succeeded', amount: 499, currency: 'USD' }],
          },
          program: { title: 'Executive Leadership Track' },
          version: { version: 'v1.0' },
        },
        {
          id: 'signed-2',
          userId: 'user-2',
          templateId: sharedDefaultTemplate.id,
          enrolment: {
            status: EnrolmentStatus.ACTIVE,
            payments: [{ status: 'succeeded', amount: 399, currency: 'USD' }],
          },
          program: { title: 'Product Design Systems' },
          version: { version: 'v1.0' },
        },
      ];

      prismaMock.signedAgreement.findMany.mockResolvedValue(completedRecords);

      const res: any = await agreementsService.getSignedAgreementsForTemplate(
        sharedDefaultTemplate.id,
        { tab: SignedRecordsTab.COMPLETED, page: 1, limit: 10 },
        adminUser,
      );

      expect(res.counts.completed).toBe(2);
      expect(res.counts.pendingPayment).toBe(1);
      expect(res.counts.all).toBe(3);
      expect(res.data.length).toBe(2);
      expect(res.data[0].paymentStatus).toBe('PAID');
      expect(res.data[1].paymentStatus).toBe('PAID');
    });

    it('displays signed agreements awaiting payment in the PENDING_PAYMENT view without deleting evidence', async () => {
      prismaMock.agreementTemplate.findUnique.mockResolvedValue(sharedDefaultTemplate);

      prismaMock.signedAgreement.count
        .mockResolvedValueOnce(2)
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(3);

      const pendingRecord = {
        id: 'signed-unpaid-3',
        userId: learnerA.id,
        templateId: sharedDefaultTemplate.id,
        typedName: 'Alice Learner',
        enrolment: {
          status: EnrolmentStatus.PENDING_PAYMENT,
          payments: [],
        },
        program: { title: 'Product Design Systems' },
        version: { version: 'v1.0' },
        signedAt: new Date(),
      };

      prismaMock.signedAgreement.findMany.mockResolvedValue([pendingRecord]);

      const res: any = await agreementsService.getSignedAgreementsForTemplate(
        sharedDefaultTemplate.id,
        { tab: SignedRecordsTab.PENDING_PAYMENT, page: 1, limit: 10 },
        adminUser,
      );

      expect(res.data.length).toBe(1);
      expect(res.data[0].id).toBe('signed-unpaid-3');
      expect(res.data[0].paymentStatus).toBe('PENDING');
      expect(res.data[0].enrolmentStatus).toBe(EnrolmentStatus.PENDING_PAYMENT);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. VERIFY PAYMENT AND COURSE ACCESS STATE
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Pillar 2: Verify payment and course-access state', () => {
    it('activates enrolment and grants access on payment.succeeded ONLY when agreement is signed', async () => {
      const enrolmentWithSigned = {
        id: 'enrol-101',
        userId: learnerA.id,
        status: EnrolmentStatus.PENDING_PAYMENT,
        program: programLeadership,
        batch: { id: 'batch-1', name: 'Cohort 2026' },
        user: learnerA,
        signedAgreement: {
          id: 'signed-101',
          status: AgreementStatus.SIGNED,
        },
      };

      prismaMock.payment.findUnique.mockResolvedValue(null);
      prismaMock.enrolment.findUnique.mockResolvedValue(enrolmentWithSigned);
      prismaMock.payment.create.mockResolvedValue({ id: 'pay-1', status: 'succeeded' });

      const res = await paymentWebhookController.handlePaymentWebhook({
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test_session_101',
            metadata: { enrolmentId: 'enrol-101' },
            amount_total: 49900,
            currency: 'usd',
          },
        },
      });

      expect(res.received).toBe(true);
      expect(res.isSigned).toBe(true);
      expect(res.enrolmentStatus).toBe(EnrolmentStatus.ACTIVE);
      expect(res.courseAccessGranted).toBe(true);

      expect(prismaMock.enrolment.update).toHaveBeenCalledWith({
        where: { id: 'enrol-101' },
        data: { status: EnrolmentStatus.ACTIVE },
      });
      expect(cacheHelperMock.invalidateNamespace).toHaveBeenCalledWith('enrolment_progression:enrol-101');
    });

    it('blocks course access if payment succeeds but learner has NOT signed agreement', async () => {
      const enrolmentUnsigned = {
        id: 'enrol-102',
        userId: learnerB.id,
        status: EnrolmentStatus.PENDING_PAYMENT,
        program: programLeadership,
        batch: { id: 'batch-1', name: 'Cohort 2026' },
        user: learnerB,
        signedAgreement: null, // NOT signed
      };

      prismaMock.payment.findUnique.mockResolvedValue(null);
      prismaMock.enrolment.findUnique.mockResolvedValue(enrolmentUnsigned);
      prismaMock.payment.create.mockResolvedValue({ id: 'pay-2', status: 'succeeded' });

      const res = await paymentWebhookController.handlePaymentWebhook({
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: 'pi_test_unsigned',
            metadata: { enrolmentId: 'enrol-102' },
            amount: 499,
            currency: 'usd',
          },
        },
      });

      expect(res.received).toBe(true);
      expect(res.isSigned).toBeFalsy();
      expect(res.enrolmentStatus).toBe(EnrolmentStatus.PENDING_AGREEMENT);
      expect(res.courseAccessGranted).toBe(false);

      expect(prismaMock.enrolment.update).toHaveBeenCalledWith({
        where: { id: 'enrol-102' },
        data: { status: EnrolmentStatus.PENDING_AGREEMENT },
      });
    });

    it('handles retried and duplicate webhook callbacks idempotently without duplicating payments', async () => {
      const existingSucceededPayment = {
        id: 'pay-existing-99',
        enrolmentId: 'enrol-101',
        stripeSessionId: 'cs_test_duplicate',
        status: 'succeeded',
      };

      prismaMock.payment.findUnique.mockResolvedValue(existingSucceededPayment);

      const res = await paymentWebhookController.handlePaymentWebhook({
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test_duplicate',
            metadata: { enrolmentId: 'enrol-101' },
          },
        },
      });

      expect(res.received).toBe(true);
      expect(res.idempotent).toBe(true);
      expect(res.status).toBe('ALREADY_PROCESSED');
      expect(prismaMock.payment.create).not.toHaveBeenCalled();
      expect(prismaMock.enrolment.update).not.toHaveBeenCalled();
    });

    it('records failed payments and prevents course access without deleting signing evidence', async () => {
      prismaMock.payment.findUnique.mockResolvedValue(null);
      prismaMock.payment.create.mockResolvedValue({ id: 'pay-failed-1' });

      const res = await paymentWebhookController.handlePaymentWebhook({
        type: 'payment.failed',
        data: {
          object: {
            id: 'cs_failed_session',
            metadata: { enrolmentId: 'enrol-101' },
            last_payment_error: { message: 'Card declined' },
          },
        },
      });

      expect(res.received).toBe(true);
      expect(res.status).toBe('FAILED');
      expect(res.courseAccessGranted).toBe(false);
      expect(res.signingEvidencePreserved).toBe(true);

      // Verify SignedAgreement was NEVER deleted
      expect(prismaMock.signedAgreement.delete).toBeUndefined();
      expect(prismaMock.payment.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'failed' }) }),
      );
    });

    it('revokes enrolment access on refunds and chargebacks while preserving legal signing evidence', async () => {
      prismaMock.payment.updateMany.mockResolvedValue({ count: 1 });
      prismaMock.enrolment.update.mockResolvedValue({ id: 'enrol-101', status: EnrolmentStatus.REVOKED });

      const res = await paymentWebhookController.handlePaymentWebhook({
        type: 'charge.refunded',
        data: {
          object: {
            id: 'ch_refunded_1',
            metadata: { enrolmentId: 'enrol-101' },
          },
        },
      });

      expect(res.received).toBe(true);
      expect(res.status).toBe('REVOKED');
      expect(res.courseAccessGranted).toBe(false);
      expect(res.signedEvidencePreserved).toBe(true);

      expect(prismaMock.enrolment.update).toHaveBeenCalledWith({
        where: { id: 'enrol-101' },
        data: { status: EnrolmentStatus.REVOKED },
      });
      expect(cacheHelperMock.invalidateNamespace).toHaveBeenCalledWith('enrolment_progression:enrol-101');
    });

    it('rejects unauthenticated webhooks when STRIPE_WEBHOOK_SECRET is configured', async () => {
      const origSecret = process.env.STRIPE_WEBHOOK_SECRET;
      try {
        process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_secret_123';

        await expect(
          paymentWebhookController.handlePaymentWebhook(
            {
              type: 'checkout.session.completed',
              data: { object: { id: 'cs_unauth', metadata: { enrolmentId: 'enrol-101' } } },
            },
            'invalid_signature',
            'wrong_secret',
          ),
        ).rejects.toThrow('Invalid webhook credentials');
      } finally {
        if (origSecret === undefined) {
          delete process.env.STRIPE_WEBHOOK_SECRET;
        } else {
          process.env.STRIPE_WEBHOOK_SECRET = origSecret;
        }
      }
    });

    it('rejects payment webhooks missing provider transaction ID / session ID', async () => {
      await expect(
        paymentWebhookController.handlePaymentWebhook({
          type: 'checkout.session.completed',
          data: { object: { metadata: { enrolmentId: 'enrol-101' } } }, // no id or session
        }),
      ).rejects.toThrow('Missing provider transaction ID or session ID');
    });

    it('rejects payment with ownership mismatch between payload userId and enrolment owner', async () => {
      const enrolmentWithSigned = {
        id: 'enrol-101',
        userId: learnerA.id,
        status: EnrolmentStatus.PENDING_PAYMENT,
        program: programLeadership,
        batch: { id: 'batch-1', name: 'Cohort 2026' },
        user: learnerA,
        signedAgreement: { id: 'signed-101', status: AgreementStatus.SIGNED },
      };

      prismaMock.payment.findUnique.mockResolvedValue(null);
      prismaMock.enrolment.findUnique.mockResolvedValue(enrolmentWithSigned);

      await expect(
        paymentWebhookController.handlePaymentWebhook({
          type: 'checkout.session.completed',
          data: {
            object: {
              id: 'cs_tampered_owner',
              metadata: { enrolmentId: 'enrol-101', userId: 'attacker-id-different-from-learnerA' },
            },
          },
        }),
      ).rejects.toThrow('Payment ownership mismatch');
    });

    it('prevents reactivation of an already REVOKED enrolment on late/out-of-order payment event', async () => {
      const revokedEnrolment = {
        id: 'enrol-revoked-1',
        userId: learnerA.id,
        status: EnrolmentStatus.REVOKED, // Already revoked
        program: programLeadership,
        batch: { id: 'batch-1', name: 'Cohort 2026' },
        user: learnerA,
        signedAgreement: { id: 'signed-101', status: AgreementStatus.SIGNED },
      };

      prismaMock.payment.findUnique.mockResolvedValue(null);
      prismaMock.enrolment.findUnique.mockResolvedValue(revokedEnrolment);

      const res = await paymentWebhookController.handlePaymentWebhook({
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_late_payment',
            metadata: { enrolmentId: 'enrol-revoked-1' },
          },
        },
      });

      expect(res.received).toBe(true);
      expect(res.status).toBe('REVOKED_IMMUTABLE');
      expect(res.courseAccessGranted).toBe(false);
      // Ensure enrolment update to ACTIVE is NOT called
      expect(prismaMock.enrolment.update).not.toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: EnrolmentStatus.ACTIVE } }),
      );
    });

    it('rejects refund if payment session belongs to a different enrolment to prevent cross-learner revocation', async () => {
      // Payment belongs to enrol-202, but payload specifies enrolmentId = enrol-101
      prismaMock.payment.findUnique.mockResolvedValue({
        id: 'pay-202',
        enrolmentId: 'enrol-202',
        stripeSessionId: 'cs_session_victim',
      });

      await expect(
        paymentWebhookController.handlePaymentWebhook({
          type: 'charge.refunded',
          enrolmentId: 'enrol-101', // mismatch!
          data: {
            object: {
              id: 'cs_session_victim',
            },
          },
        }),
      ).rejects.toThrow('Payment to enrollment mismatch on refund');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. ADMIN SIGNED RECORDS & AUDIT INTERFACE
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Pillar 3: Admin Signed Records & Audit Interface', () => {
    it('supports search across learner name, email, and program title', async () => {
      prismaMock.agreementTemplate.findUnique.mockResolvedValue(sharedDefaultTemplate);
      prismaMock.signedAgreement.count.mockResolvedValue(1);
      prismaMock.signedAgreement.findMany.mockResolvedValue([]);

      await agreementsService.getSignedAgreementsForTemplate(
        sharedDefaultTemplate.id,
        { search: 'alice', tab: SignedRecordsTab.ALL },
        adminUser,
      );

      expect(prismaMock.signedAgreement.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            AND: expect.arrayContaining([
              expect.objectContaining({
                OR: expect.arrayContaining([
                  { user: { name: { contains: 'alice', mode: 'insensitive' } } },
                  { user: { email: { contains: 'alice', mode: 'insensitive' } } },
                ]),
              }),
            ]),
          }),
        }),
      );
    });

    it('enforces role-based isolation: manager cannot view signed records outside assigned batches', async () => {
      const recordInBatch1 = {
        id: 'signed-record-batch1',
        templateId: programSpecificTemplate.id,
        userId: learnerA.id,
        enrolmentId: 'enrol-1',
        enrolment: {
          batch: { managerId: managerUser.id },
          payments: [],
        },
      };

      prismaMock.signedAgreement.findUnique.mockResolvedValue(recordInBatch1);

      // Same manager can view
      const detail = await agreementsService.getSignedAgreementDetail(
        'signed-record-batch1',
        managerUser,
      );
      expect(detail.id).toBe('signed-record-batch1');

      // Different manager is rejected with ForbiddenException
      await expect(
        agreementsService.getSignedAgreementDetail(
          'signed-record-batch1',
          otherManagerUser,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('enforces PDF download role-based authorization and prevents cross-learner access', async () => {
      const recordBelongingToAlice = {
        id: 'signed-alice',
        templateId: programSpecificTemplate.id,
        userId: learnerA.id,
        templateVersion: 'v2.0',
        typedName: 'Alice Learner',
        drawnSignature: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA',
        signatureType: 'DRAWN',
        signerIp: '127.0.0.1',
        version: { version: 'v2.0', content: 'Terms' },
        template: { id: programSpecificTemplate.id, title: 'Agreement' },
        program: { title: 'Leadership' },
        user: { email: 'alice@example.com' },
        enrolment: { batch: { managerId: managerUser.id } },
      };

      prismaMock.signedAgreement.findUnique.mockResolvedValue(recordBelongingToAlice);

      // Bob cannot download Alice's PDF
      await expect(
        agreementsService.renderSignedAgreementPdf(
          programSpecificTemplate.id,
          'signed-alice',
          learnerB,
        ),
      ).rejects.toThrow(ForbiddenException);

      // Alice can download her own PDF
      const pdfBytes = await agreementsService.renderSignedAgreementPdf(
        programSpecificTemplate.id,
        'signed-alice',
        learnerA,
      );
      expect(pdfBytes).toBeInstanceOf(Uint8Array);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. SHARED-DEFAULT AGREEMENT HANDLING
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Pillar 4: Handle shared-default agreements correctly', () => {
    it('adheres to precedence: selects program-specific agreement over shared-default when available', async () => {
      prismaMock.agreementTemplate.findFirst.mockResolvedValue(programSpecificTemplate);

      const activeVer = await agreementsService.getActiveVersionForProgram(
        programLeadership.id,
      );

      expect(activeVer.templateId).toBe(programSpecificTemplate.id);
      expect(activeVer.version).toBe('v2.0');
    });

    it('falls back to shared-default when program has no specific agreement and attributes actual program', async () => {
      // First call for program-specific returns null
      prismaMock.agreementTemplate.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(sharedDefaultTemplate);

      prismaMock.program.findUnique.mockResolvedValue(programDesign);

      const activeVer = await agreementsService.getActiveVersionForProgram(
        programDesign.id,
      );

      expect(activeVer.templateId).toBe(sharedDefaultTemplate.id);
      expect(activeVer.programId).toBe(programDesign.id);
      expect(activeVer.programTitle).toBe(programDesign.title);
      expect(activeVer.version).toBe('v1.0');
    });

    it('accurately identifies and attributes programs that used a shared-default agreement in signed records', async () => {
      prismaMock.agreementTemplate.findUnique.mockResolvedValue(sharedDefaultTemplate);
      prismaMock.signedAgreement.count.mockResolvedValue(2);

      const sharedRecords = [
        {
          id: 'sig-sh-1',
          templateId: sharedDefaultTemplate.id,
          programId: programDesign.id,
          program: programDesign,
          enrolment: {
            status: EnrolmentStatus.ACTIVE,
            payments: [{ status: 'succeeded' }],
          },
          version: { version: 'v1.0' },
        },
      ];

      prismaMock.signedAgreement.findMany.mockResolvedValue(sharedRecords);

      const res: any = await agreementsService.getSignedAgreementsForTemplate(
        sharedDefaultTemplate.id,
        { tab: SignedRecordsTab.ALL },
        adminUser,
      );

      expect(res.data[0].scope).toBe('SHARED_DEFAULT');
      expect(res.data[0].programTitle).toBe(programDesign.title);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 5. PRESERVE SIGNATURE EVIDENCE & SECURITY
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Pillar 5: Preserve signature evidence and security', () => {
    it('keeps historical signed agreement snapshot immutable when profile signature is updated', async () => {
      prismaMock.user.update.mockResolvedValue({
        id: learnerA.id,
        savedSignature: 'data:image/png;base64,NEW_PROFILE_SIGNATURE',
        savedSignatureType: 'DRAWN',
        savedSignatureUpdatedAt: new Date(),
      });

      const updateRes = await agreementsService.updateLearnerSavedSignature(
        learnerA.id,
        'data:image/png;base64,NEW_PROFILE_SIGNATURE',
        'DRAWN',
        '10.0.0.1',
      );

      expect(updateRes.success).toBe(true);
      expect(prismaMock.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: learnerA.id },
          data: expect.objectContaining({
            savedSignature: 'data:image/png;base64,NEW_PROFILE_SIGNATURE',
          }),
        }),
      );

      // Crucial: SignedAgreement table is NOT touched when profile signature is updated
      expect(prismaMock.signedAgreement.update).not.toHaveBeenCalled();
      expect(prismaMock.signedAgreement.updateMany).not.toHaveBeenCalled();
    });

    it('rejects signing without explicit consent even if reusable signature is provided', async () => {
      const enrolmentPending = {
        id: 'enrol-test',
        userId: learnerA.id,
        programId: programLeadership.id,
        status: EnrolmentStatus.PENDING_PAYMENT,
      };

      prismaMock.enrolment.findUnique.mockResolvedValue(enrolmentPending);

      await expect(
        agreementsService.signAgreement(
          {
            enrolmentId: enrolmentPending.id,
            consentGiven: false, // Explicit consent omitted
            typedName: 'Alice Learner',
            useSavedSignature: true,
          },
          learnerA,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
