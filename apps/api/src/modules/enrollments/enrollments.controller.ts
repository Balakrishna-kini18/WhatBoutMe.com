import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { AgreementStatus, BatchStatus, ContentStatus, EnrolmentStatus } from '@prisma/client';
import { EnrollmentsService } from './enrollments.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { EmailService } from '../email/email.service.js';
import { CacheHelperService } from '../../common/cache/cache-helper.service.js';
import { RequirePermission } from '../../common/decorators/require-permission.decorator.js';
import { CouponsService } from '../coupons/coupons.service.js';
import {
  BatchAccessGuard,
  RequireBatchAccess,
} from '../../common/guards/batch-access.guard.js';
import { Permission } from '../../config/permissions.config.js';
import {
  CreateEnrolmentDto,
  PaymentMode,
  QueryEnrolmentsDto,
  TransferBatchDto,
  TransitionEnrolmentStatusDto,
} from './dto/index.js';

// ─────────────────────────────────────────────────────────────────────────────
// 1. ADMIN ENROLMENTS CONTROLLER
// ─────────────────────────────────────────────────────────────────────────────

@Controller(['admin/enrolments', 'admin/enrollments'])
export class AdminEnrolmentsController {
  constructor(private readonly enrollmentsService: EnrollmentsService) {}

  @RequirePermission(Permission.ENROLMENTS_CREATE)
  @Post()
  async create(@Body() dto: CreateEnrolmentDto, @Request() req?: any) {
    return req?.user
      ? this.enrollmentsService.create(dto, req.user)
      : this.enrollmentsService.create(dto);
  }

  @RequirePermission(Permission.ENROLMENTS_READ)
  @Get()
  async findAll(@Request() req: any, @Query() query: QueryEnrolmentsDto) {
    return this.enrollmentsService.findAll(req.user, query);
  }

  @RequirePermission(Permission.ENROLMENTS_READ)
  @Get(':id')
  async findOne(@Param('id') id: string, @Request() req: any) {
    return this.enrollmentsService.findOne(id, req.user);
  }

  @RequirePermission(Permission.ENROLMENTS_UPDATE)
  @Patch(':id/status')
  async transitionStatus(
    @Param('id') id: string,
    @Body() dto: TransitionEnrolmentStatusDto,
    @Request() req?: any,
  ) {
    return req?.user
      ? this.enrollmentsService.transitionStatus(id, dto, req.user)
      : this.enrollmentsService.transitionStatus(id, dto);
  }

  @RequirePermission(Permission.ENROLMENTS_UPDATE)
  @Post(':id/transfer')
  async transfer(
    @Param('id') id: string,
    @Body() dto: TransferBatchDto,
    @Request() req?: any,
  ) {
    return req?.user
      ? this.enrollmentsService.transferBatch(id, dto, req.user)
      : this.enrollmentsService.transferBatch(id, dto);
  }

  @RequirePermission(Permission.ENROLMENTS_CANCEL)
  @Post(':id/cancel')
  async cancel(@Param('id') id: string, @Request() req?: any) {
    return req?.user
      ? this.enrollmentsService.cancel(id, req.user)
      : this.enrollmentsService.cancel(id);
  }

  @RequirePermission(Permission.ENROLMENTS_CANCEL)
  @Post(':id/release-seat')
  async releaseSeat(@Param('id') id: string, @Request() req?: any) {
    return req?.user
      ? this.enrollmentsService.cancel(id, req.user)
      : this.enrollmentsService.cancel(id);
  }

  @RequirePermission(Permission.ENROLMENTS_UPDATE)
  @Post(':id/resend-payment-link')
  async resendPaymentLink(@Param('id') id: string, @Request() req?: any) {
    return req?.user
      ? this.enrollmentsService.resendPaymentLink(id, req.user)
      : this.enrollmentsService.resendPaymentLink(id);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. BATCH WAITLIST PROMOTION CONTROLLER
// ─────────────────────────────────────────────────────────────────────────────

@Controller('batches')
export class BatchWaitlistController {
  constructor(private readonly enrollmentsService: EnrollmentsService) {}

  @RequirePermission(Permission.ENROLMENTS_UPDATE)
  @RequireBatchAccess('batchId')
  @UseGuards(BatchAccessGuard)
  @Post(':batchId/waitlist/promote-next')
  async promoteNextWaitlisted(@Param('batchId') batchId: string) {
    return this.enrollmentsService.promoteNextWaitlisted(batchId);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. LEARNER SELF-SERVICE ENROLMENTS CONTROLLER
// ─────────────────────────────────────────────────────────────────────────────

@Controller(['enrolments', 'enrollments'])
export class LearnerEnrolmentsController {
  constructor(private readonly enrollmentsService: EnrollmentsService) {}

  @Get('me')
  async findMyEnrolments(@Request() req: any) {
    const userId = req.user?.sub ?? req.user?.id;
    return this.enrollmentsService.findForLearner(userId);
  }

  @Get('me/:id')
  async findMyEnrolment(@Param('id') id: string, @Request() req: any) {
    const userId = req.user?.sub ?? req.user?.id;
    return this.enrollmentsService.findOneForLearner(id, userId);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. MOCK CHECKOUT CONTROLLER
// ─────────────────────────────────────────────────────────────────────────────

@Controller(['checkout', 'enrolments/checkout', 'enrollments/checkout'])
export class CheckoutController {
  constructor(
    private readonly enrollmentsService: EnrollmentsService,
    private readonly prisma: PrismaService,
    @Optional() private readonly emailService?: EmailService,
    @Optional() private readonly couponsService?: CouponsService,
    @Optional() private readonly cacheHelper?: CacheHelperService,
  ) {}

  @Post(['mock', 'confirm'])
  async mockCheckout(@Body() body: any, @Request() req: any) {
    // SECURITY: only server configuration may enable mock checkout in production.
    // Client-supplied flags (bypass/simulate/bypassPayment) are accepted for
    // dev/staging compatibility but must never relax this guard, otherwise any
    // authenticated user could unlock a paid course for free.
    const isMockAllowed = process.env.ALLOW_MOCK_CHECKOUT === 'true';

    if (process.env.NODE_ENV === 'production' && !isMockAllowed) {
      throw new ForbiddenException(
        'Mock checkout is disabled in production. Payments must be processed through the verified payment provider.',
      );
    }

    const userId = req.user?.sub ?? req.user?.id;
    const { programId, enrolmentId } = body;
    if (!userId) {
      throw new BadRequestException('Authentication required');
    }
    if (!programId && !enrolmentId) {
      throw new BadRequestException('Missing user, programId, or enrolmentId');
    }

    // 1. Find existing enrolment by enrolmentId or (userId, programId)
    let existing: any = null;
    if (enrolmentId) {
      existing = await this.prisma.enrolment.findUnique({
        where: { id: enrolmentId },
        include: {
          program: { select: { id: true, title: true, slug: true, price: true } },
          batch: { select: { id: true, name: true, startDate: true } },
        },
      });
      if (existing && existing.userId !== userId) {
        throw new ForbiddenException('You are not authorized to complete checkout for this enrolment');
      }
    }

    if (!existing && programId) {
      existing = await this.prisma.enrolment.findFirst({
        where: { userId, programId },
        include: {
          program: { select: { id: true, title: true, slug: true, price: true } },
          batch: { select: { id: true, name: true, startDate: true } },
        },
      });
    }

    const targetProgramId = existing?.programId || programId;

    // 2. Strict Agreement Pre-Payment Gate
    if (!existing) {
      throw new BadRequestException({
        error: 'AGREEMENT_REQUIRED',
        message: 'Program agreement must be signed before payment confirmation',
        agreementUrl: `/agreement?programId=${targetProgramId}`,
      });
    }

    if (existing.status === EnrolmentStatus.REVOKED) {
      throw new BadRequestException('Cannot complete checkout for a revoked enrolment.');
    }

    const signed = await this.prisma.signedAgreement.findUnique({
      where: { enrolmentId: existing.id },
    });

    if (!signed || signed.status !== AgreementStatus.SIGNED) {
      throw new BadRequestException({
        error: 'AGREEMENT_REQUIRED',
        message: 'Program agreement must be signed before payment confirmation',
        agreementUrl: `/agreement?programId=${existing.programId}&enrolmentId=${existing.id}`,
      });
    }

    // 3. Process payment & transition to ACTIVE
    // Check if coupon was provided
    let couponValidation: any = null;
    if (body.couponCode && this.couponsService) {
      couponValidation = await this.couponsService.validateCoupon({
        code: body.couponCode,
        programId: targetProgramId,
        currency: body.currency || 'USD',
        userId,
        paymentPlanType: body.paymentPlanType || 'FULL',
      });
    }

    // Capacity & Waitlist Safety Check:
    // If the learner is already WAITLIST, or if the assigned batch is at capacity or past deadline,
    // they MUST remain/transition to WAITLIST to prevent oversubscribing the batch.
    let targetStatus: EnrolmentStatus;
    if (existing.status === EnrolmentStatus.WAITLIST) {
      targetStatus = EnrolmentStatus.WAITLIST;
    } else {
      const batch = existing.batchId
        ? await this.prisma.batch.findUnique({
            where: { id: existing.batchId },
            include: {
              _count: {
                select: {
                  enrolments: {
                    where: {
                      id: { not: existing.id },
                      status: { in: [EnrolmentStatus.ACTIVE, EnrolmentStatus.PENDING_AGREEMENT, EnrolmentStatus.COMPLETED] },
                    },
                  },
                },
              },
            },
          })
        : null;

      const occupied = batch?._count?.enrolments ?? 0;
      const capacity = batch?.capacity ?? 50;
      const isFull = occupied >= capacity;
      const isDeadlinePassed = batch?.registrationDeadline
        ? new Date() > new Date(batch.registrationDeadline)
        : false;

      if (isFull || isDeadlinePassed) {
        targetStatus = EnrolmentStatus.WAITLIST;
      } else if (couponValidation?.isFree) {
        targetStatus = EnrolmentStatus.PENDING_AGREEMENT;
      } else {
        targetStatus = EnrolmentStatus.ACTIVE;
      }
    }

    const updatedEnrolment = await this.prisma.enrolment.update({
      where: { id: existing.id },
      data: { status: targetStatus },
      include: {
        program: { select: { id: true, title: true, slug: true, price: true } },
        batch: { select: { id: true, name: true, startDate: true } },
      },
    });
    existing.status = targetStatus;
    const finalEnrolment = updatedEnrolment || existing;

    // Record mock payment and invoice if not already recorded
    const existingPayment = await this.prisma.payment.findFirst({
      where: { enrolmentId: existing.id, status: 'succeeded' },
    });

    if (!existingPayment) {
      const currency = body.currency || couponValidation?.currency || 'USD';
      const expectedAmount = couponValidation
        ? couponValidation.finalAmount
        : (existing.batch?.price ?? existing.program?.price ?? 0);
      let paymentAmount = expectedAmount;

      if (body.amount !== undefined) {
        const clientMinor = Math.round(Number(body.amount) * 100);
        const expectedMinor = Math.round(Number(expectedAmount) * 100);
        if (clientMinor < expectedMinor) {
          throw new BadRequestException(
            `Payment underpayment rejected: expected ${expectedAmount} ${currency}, received ${body.amount} ${currency}`,
          );
        }
        if (Math.abs(clientMinor - expectedMinor) > 1) {
          throw new BadRequestException(
            `Payment amount tampering detected: expected ${expectedAmount} ${currency}, received ${body.amount} ${currency}`,
          );
        }
      }

      const payment = await this.prisma.payment.create({
        data: {
          enrolmentId: existing.id,
          stripeSessionId: `pay_${Date.now()}_${existing.id.slice(0, 8)}`,
          amount: paymentAmount,
          currency,
          status: 'succeeded',
          couponId: couponValidation?.couponId,
          couponCode: couponValidation?.code,
          discountAmount: couponValidation?.discountAmount,
        },
      });

      await this.prisma.invoice.create({
        data: {
          paymentId: payment.id,
          invoiceNumber: `INV-${Date.now()}-${existing.id.slice(0, 4)}`,
          amount: paymentAmount,
          currency,
          status: 'PAID',
          couponCode: couponValidation?.code,
          discountAmount: couponValidation?.discountAmount,
        },
      });

      if (this.couponsService && couponValidation?.couponId) {
        await this.prisma.$transaction(async (tx) => {
          await this.couponsService!.redeemCouponAtomic(tx, {
            couponId: couponValidation.couponId,
            userId,
            enrolmentId: existing.id,
            paymentId: payment.id,
            orderAmount: couponValidation.originalAmount,
            discountAmount: couponValidation.discountAmount,
            finalAmount: couponValidation.finalAmount,
            currency: couponValidation.currency,
          });
        });
      }
    }

    if (this.cacheHelper) {
      await this.cacheHelper.invalidateNamespace(`enrolment_progression:${existing.id}`).catch(() => {});
      await this.cacheHelper.invalidateNamespace('enrolments').catch(() => {});
      await this.cacheHelper.invalidateNamespace('batches').catch(() => {});
    }

    // Send confirmation emails
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const program = existing.program || (await this.prisma.program.findUnique({ where: { id: targetProgramId } }));
    const batch = existing.batch;

    if (this.emailService && user && program) {
      const lmsUrl = process.env.NEXT_PUBLIC_LMS_URL || 'http://localhost:3003';
      const firstName = user.name ? (user.name.split(' ')[0] || user.name) : 'Student';

      // 1. Payment Confirmation Email
      this.emailService
        .sendTemplateEmail({
          to: user.email,
          subject: `Payment Successful - ${program.title}`,
          template: 'PaymentSuccessEmail',
          props: {
            learnerName: user.name,
            programTitle: program.title,
            amount: program.price || 0,
            dashboardUrl: `${lmsUrl}/dashboard`,
          },
        })
        .catch((e: any) => console.warn('[CheckoutController] Payment email error:', e?.message));

      // 2. Enrolment Confirmed Email
      if (batch) {
        this.emailService
          .sendTemplateEmail({
            to: user.email,
            subject: `Enrollment Confirmed: ${program.title}`,
            template: 'EnrolmentConfirmedEmail',
            props: {
              firstName,
              programName: program.title,
              batchName: batch.name,
              startDate: batch.startDate ? new Date(batch.startDate).toLocaleDateString() : 'Immediate',
              dashboardUrl: `${lmsUrl}/dashboard`,
            },
          })
          .catch((e: any) => console.warn('[CheckoutController] Enrolment email error:', e?.message));
      }
    }

    return {
      success: true,
      enrollment: finalEnrolment,
      status: finalEnrolment?.status || targetStatus,
    };
  }
}
