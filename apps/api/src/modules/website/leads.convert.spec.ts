import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { LeadsController } from './leads.controller.js';
import { BatchStatus, EnrolmentStatus, LeadStatus, Role } from '@prisma/client';

describe('LeadsController - One-Click Convert & Send Payment Link', () => {
  let controller: LeadsController;
  let prismaMock: any;
  let emailMock: any;
  let auditMock: any;
  let jwtMock: any;

  beforeEach(() => {
    prismaMock = {
      lead: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'lead-test-1',
          name: 'Jane Doe',
          email: 'jane@example.com',
          phone: '+971501234567',
          message: 'Course Inquiry: Masterclass (ID: prog-123)',
          status: LeadStatus.CONTACTED,
        }),
        update: vi.fn().mockImplementation(({ data }: any) => ({
          id: 'lead-test-1',
          name: 'Jane Doe',
          email: 'jane@example.com',
          status: data.status,
          message: data.message,
        })),
      },
      user: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({
          id: 'user-new-1',
          email: 'jane@example.com',
          name: 'Jane Doe',
          role: Role.USER,
        }),
      },
      program: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'prog-123',
          title: 'Neuroplasticity Masterclass',
          description: '11 Steps to Brain Wellness',
          price: 500,
          priceUSD: 500,
          priceAED: 1850,
          priceINR: 42000,
          currency: 'USD',
          isPublished: true,
        }),
        findFirst: vi.fn().mockResolvedValue({
          id: 'prog-123',
          title: 'Neuroplasticity Masterclass',
          price: 500,
          currency: 'USD',
          isPublished: true,
        }),
      },
      batch: {
        findUnique: vi.fn().mockResolvedValue(null),
        findFirst: vi.fn().mockResolvedValue({
          id: 'batch-1',
          name: 'Cohort Alpha',
          programId: 'prog-123',
          status: BatchStatus.UPCOMING,
        }),
        create: vi.fn(),
      },
      enrolment: {
        findFirst: vi.fn().mockResolvedValue(null),
        findUnique: vi.fn().mockResolvedValue({
          id: 'enrol-1',
          status: EnrolmentStatus.PENDING_AGREEMENT,
        }),
        create: vi.fn().mockResolvedValue({
          id: 'enrol-1',
          status: EnrolmentStatus.PENDING_AGREEMENT,
          userId: 'user-new-1',
          programId: 'prog-123',
        }),
        update: vi.fn().mockImplementation(({ where, data }: any) => ({
          id: where.id,
          status: EnrolmentStatus.PENDING_AGREEMENT,
          ...data,
        })),
      },
      userSession: {
        create: vi.fn().mockResolvedValue({ id: 'sess-1' }),
      },
    };

    emailMock = {
      sendEmail: vi.fn().mockResolvedValue({ id: 'email-1' }),
    };

    auditMock = {
      log: vi.fn().mockResolvedValue({ id: 'audit-1' }),
    };

    jwtMock = {
      sign: vi.fn().mockReturnValue('mocked-jwt-token'),
    };

    controller = new LeadsController(
      prismaMock,
      emailMock,
      auditMock,
      jwtMock,
    );
  });

  it('converts a lead, provisions user and enrolment, logs LEAD_CONVERT audit, and dispatches payment email', async () => {
    const result = await controller.convertAndSendLink(
      'lead-test-1',
      {
        courseId: 'prog-123',
        currency: 'USD',
        note: 'Agreed on 1-on-1 call for October Cohort',
      },
      { user: { id: 'admin-1', role: Role.ADMIN } },
    );

    expect(result.success).toBe(true);
    expect(result.leadStatus).toBe(LeadStatus.CONVERTED);
    expect(result.checkoutUrl).toContain('/checkout/lead/');
    expect(result.token).toBeDefined();

    // Verify user was created
    expect(prismaMock.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        email: 'jane@example.com',
        name: 'Jane Doe',
        role: Role.USER,
      }),
    });

    // Verify enrolment created with PENDING_AGREEMENT
    expect(prismaMock.enrolment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-new-1',
        programId: 'prog-123',
        status: EnrolmentStatus.PENDING_AGREEMENT,
      }),
    });

    // Verify AuditLog LEAD_CONVERT
    expect(auditMock.log).toHaveBeenCalledWith(
      prismaMock,
      expect.objectContaining({
        actorId: 'admin-1',
        action: 'LEAD_CONVERT',
        entityType: 'Lead',
        entityId: 'lead-test-1',
        reason: 'Agreed on 1-on-1 call for October Cohort',
        metadata: expect.objectContaining({
          currency: 'USD',
          amount: 500,
        }),
      }),
    );

    // Verify email was sent to prospect with checkout link
    expect(emailMock.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'jane@example.com',
        subject: expect.stringContaining('Neuroplasticity Masterclass'),
        html: expect.stringContaining(result.checkoutUrl),
      }),
    );
  });

  it('resends payment link for already converted lead without creating duplicate user or enrolment', async () => {
    // Existing user and existing enrolment
    prismaMock.user.findUnique = vi.fn().mockResolvedValue({
      id: 'user-existing-1',
      email: 'jane@example.com',
      name: 'Jane Doe',
      role: Role.USER,
    });

    prismaMock.enrolment.findFirst = vi.fn().mockResolvedValue({
      id: 'enrol-existing-1',
      userId: 'user-existing-1',
      programId: 'prog-123',
      status: EnrolmentStatus.PENDING_AGREEMENT,
    });

    const result = await controller.convertAndSendLink(
      'lead-test-1',
      {
        courseId: 'prog-123',
        currency: 'AED',
      },
      { user: { id: 'admin-1', role: Role.ADMIN } },
    );

    expect(result.success).toBe(true);
    expect(prismaMock.user.create).not.toHaveBeenCalled();
    expect(prismaMock.enrolment.create).not.toHaveBeenCalled();
    expect(result.enrolmentId).toBe('enrol-existing-1');
    expect(auditMock.log).toHaveBeenCalledWith(
      prismaMock,
      expect.objectContaining({
        action: 'LEAD_CONVERT',
        metadata: expect.objectContaining({
          currency: 'AED',
          amount: 1850,
        }),
      }),
    );
  });

  it('validates signed checkout token and returns pre-filled checkout data with access token', async () => {
    // Convert first to get token
    const converted = await controller.convertAndSendLink(
      'lead-test-1',
      { courseId: 'prog-123', currency: 'INR' },
      { user: { id: 'admin-1' } },
    );

    // Mock lookups for token details
    prismaMock.user.findUnique = vi.fn().mockResolvedValue({
      id: 'user-new-1',
      name: 'Jane Doe',
      email: 'jane@example.com',
      role: Role.USER,
    });

    const tokenDetails = await controller.getCheckoutTokenDetails(converted.token);

    expect(tokenDetails.valid).toBe(true);
    expect(tokenDetails.lead.email).toBe('jane@example.com');
    expect(tokenDetails.program.id).toBe('prog-123');
    expect(tokenDetails.currency).toBe('INR');
    expect(tokenDetails.amount).toBe(42000);
    expect(tokenDetails.accessToken).toBe('mocked-jwt-token');
  });

  it('rejects tampered or forged checkout tokens with BadRequestException', async () => {
    await expect(controller.getCheckoutTokenDetails('invalid.token.here')).rejects.toThrow(
      BadRequestException,
    );

    const validConverted = await controller.convertAndSendLink(
      'lead-test-1',
      { courseId: 'prog-123' },
      { user: { id: 'admin-1' } },
    );

    const tampered = `${validConverted.token}tampered`;
    await expect(controller.getCheckoutTokenDetails(tampered)).rejects.toThrow(
      BadRequestException,
    );
  });
});
