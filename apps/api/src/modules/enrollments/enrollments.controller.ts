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
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { BatchStatus, EnrolmentStatus } from '@prisma/client';
import { EnrollmentsService } from './enrollments.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { EmailService } from '../email/email.service.js';
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

@Controller('checkout')
export class CheckoutController {
  constructor(
    private readonly enrollmentsService: EnrollmentsService,
    private readonly prisma: PrismaService,
    @Optional() private readonly emailService?: EmailService,
    @Optional() private readonly couponsService?: CouponsService,
  ) {}

  @Post('mock')
  async mockCheckout(@Body() body: any, @Request() req: any) {
    const userId = req.user?.sub ?? req.user?.id;
    const { programId } = body;
    if (!userId || !programId) {
      throw new BadRequestException('Missing user or programId');
    }
    
    // 0. Idempotency Check: if user is already enrolled in this program, activate and return immediately
    const existing = await this.prisma.enrolment.findFirst({
      where: { userId, programId },
      include: {
        program: { select: { id: true, title: true, slug: true } },
        batch: { select: { id: true, name: true, startDate: true } },
      },
    });

    if (existing) {
      if (existing.status !== EnrolmentStatus.ACTIVE) {
        await this.prisma.enrolment.update({
          where: { id: existing.id },
          data: { status: EnrolmentStatus.ACTIVE },
        });
      }
      return { success: true, enrollment: existing };
    }

    // Find active batch for the program
    let batch = await this.prisma.batch.findFirst({
      where: { 
        programId, 
        status: { in: [BatchStatus.ACTIVE, BatchStatus.UPCOMING] }
      },
      orderBy: { startDate: 'asc' }
    });
    
    if (!batch) {
      const program = await this.prisma.program.findUnique({ where: { id: programId } });
      if (!program) {
        throw new NotFoundException('Program not found');
      }

      // Auto-create a batch so the user can enroll
      batch = await this.prisma.batch.create({
        data: {
          name: `${program.title} - Cohort 1`,
          programId: programId,
          startDate: new Date(),
          capacity: 9999,
          status: BatchStatus.ACTIVE
        }
      });
    }

    // Check if coupon was provided
    let couponValidation: any = null;
    if (body.couponCode && this.couponsService) {
      couponValidation = await this.couponsService.validateCoupon({
        code: body.couponCode,
        programId,
        currency: body.currency || 'USD',
        userId,
        paymentPlanType: body.paymentPlanType || 'FULL',
      });
    }

    let activeEnrollment: any;
    try {
      const enrollment = await this.enrollmentsService.create({
        userId,
        programId,
        batchId: batch.id,
        paymentMode: PaymentMode.STRIPE,
        overrideCapacity: true
      } as any);

      // If 100% discount, keep in PENDING_AGREEMENT so agreement must be signed before unlocking Step 1
      const targetStatus = couponValidation?.isFree
        ? EnrolmentStatus.PENDING_AGREEMENT
        : EnrolmentStatus.ACTIVE;

      activeEnrollment = await this.prisma.enrolment.update({
        where: { id: enrollment.id },
        data: { status: targetStatus },
        include: {
          program: { select: { id: true, title: true, slug: true } },
          batch: { select: { id: true, name: true, startDate: true } },
        },
      });

      // If coupon used or payment recorded, create Payment and Invoice records
      if (couponValidation) {
        const payment = await this.prisma.payment.create({
          data: {
            enrolmentId: activeEnrollment.id,
            stripeSessionId: `pay_${Date.now()}_${activeEnrollment.id.slice(0, 8)}`,
            amount: couponValidation.finalAmount,
            currency: couponValidation.currency || 'USD',
            status: 'succeeded',
            couponId: couponValidation.couponId,
            couponCode: couponValidation.code,
            discountAmount: couponValidation.discountAmount,
          },
        });

        await this.prisma.invoice.create({
          data: {
            paymentId: payment.id,
            invoiceNumber: `INV-${Date.now()}-${activeEnrollment.id.slice(0, 4)}`,
            amount: couponValidation.finalAmount,
            currency: couponValidation.currency || 'USD',
            status: 'PAID',
            couponCode: couponValidation.code,
            discountAmount: couponValidation.discountAmount,
          },
        });

        if (this.couponsService && couponValidation.couponId) {
          await this.prisma.$transaction(async (tx) => {
            await this.couponsService!.redeemCouponAtomic(tx, {
              couponId: couponValidation.couponId,
              userId,
              enrolmentId: activeEnrollment.id,
              paymentId: payment.id,
              orderAmount: couponValidation.originalAmount,
              discountAmount: couponValidation.discountAmount,
              finalAmount: couponValidation.finalAmount,
              currency: couponValidation.currency,
            });
          });
        }
      }
    } catch (err: any) {
      // In case of duplicate or concurrent submission, retrieve existing
      const existingAfterErr = await this.prisma.enrolment.findFirst({
        where: { userId, programId },
        include: {
          program: { select: { id: true, title: true, slug: true } },
          batch: { select: { id: true, name: true, startDate: true } },
        },
      });
      if (existingAfterErr) {
        activeEnrollment = existingAfterErr;
        if (existingAfterErr.status !== EnrolmentStatus.ACTIVE) {
          await this.prisma.enrolment.update({
            where: { id: existingAfterErr.id },
            data: { status: EnrolmentStatus.ACTIVE },
          });
        }
      } else {
        throw err;
      }
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const program = await this.prisma.program.findUnique({ where: { id: programId } });

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

    return activeEnrollment;
  }
}
