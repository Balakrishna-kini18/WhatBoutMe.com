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
} from '@nestjs/common';
import { EnrollmentsService } from './enrollments.service.js';
import { RequirePermission } from '../../common/decorators/require-permission.decorator.js';
import {
  BatchAccessGuard,
  RequireBatchAccess,
} from '../../common/guards/batch-access.guard.js';
import { Permission } from '../../config/permissions.config.js';
import {
  CreateEnrolmentDto,
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
  async create(@Body() dto: CreateEnrolmentDto) {
    return this.enrollmentsService.create(dto);
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
  ) {
    return this.enrollmentsService.transitionStatus(id, dto);
  }

  @RequirePermission(Permission.ENROLMENTS_UPDATE)
  @Post(':id/transfer')
  async transfer(
    @Param('id') id: string,
    @Body() dto: TransferBatchDto,
  ) {
    return this.enrollmentsService.transferBatch(id, dto);
  }

  @RequirePermission(Permission.ENROLMENTS_CANCEL)
  @Post(':id/cancel')
  async cancel(@Param('id') id: string) {
    return this.enrollmentsService.cancel(id);
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
