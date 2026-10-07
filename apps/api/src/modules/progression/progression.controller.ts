import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Request,
} from '@nestjs/common';
import { ProgressionService } from './progression.service.js';
import { StepOverrideDto } from './dto/index.js';
import { RequirePermission } from '../../common/decorators/require-permission.decorator.js';
import { Permission } from '../../config/permissions.config.js';

@Controller('progression')
export class ProgressionController {
  constructor(private readonly progressionService: ProgressionService) {}

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. LEARNER SELF-SERVICE
  // ─────────────────────────────────────────────────────────────────────────────

  @Get('me/:programId')
  async getMyProgression(
    @Param('programId') programId: string,
    @Request() req: any,
  ) {
    const userId = req.user?.sub ?? req.user?.id;
    return this.progressionService.getMyProgression(userId, programId);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. ENROLMENT PROGRESSION TREE (STAFF & OWNING LEARNER)
  // ─────────────────────────────────────────────────────────────────────────────

  @RequirePermission(Permission.STEPS_READ)
  @Get('enrolments/:enrolmentId')
  async getEnrolmentProgression(
    @Param('enrolmentId') enrolmentId: string,
    @Request() req: any,
  ) {
    return this.progressionService.getEnrolmentProgression(
      enrolmentId,
      req.user,
      { persist: true },
    );
  }

  @RequirePermission(Permission.STEPS_READ)
  @Get('enrolments/:enrolmentId/steps/:stepId')
  async getStepProgression(
    @Param('enrolmentId') enrolmentId: string,
    @Param('stepId') stepId: string,
    @Request() req: any,
  ) {
    return this.progressionService.getStepProgression(
      enrolmentId,
      stepId,
      req.user,
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. ADMINISTRATIVE RECALCULATION
  // ─────────────────────────────────────────────────────────────────────────────

  @RequirePermission(Permission.STEPS_UNLOCK)
  @Post('admin/enrolments/:enrolmentId/recalculate')
  async recalculateProgression(
    @Param('enrolmentId') enrolmentId: string,
    @Request() req: any,
  ) {
    return this.progressionService.recalculateProgression(
      enrolmentId,
      req.user,
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. ADMINISTRATIVE STEP OVERRIDES (D1-034)
  // ─────────────────────────────────────────────────────────────────────────────

  @RequirePermission(Permission.STEPS_UNLOCK)
  @Post('admin/enrolments/:enrolmentId/steps/:stepId/unlock')
  async manualUnlockStep(
    @Param('enrolmentId') enrolmentId: string,
    @Param('stepId') stepId: string,
    @Body() dto: StepOverrideDto,
    @Request() req: any,
  ) {
    const ip = req.ip ?? req.headers?.['x-forwarded-for'] ?? req.socket?.remoteAddress;
    return this.progressionService.manualUnlockStep(
      enrolmentId,
      stepId,
      req.user,
      dto.reason,
      ip,
    );
  }

  @RequirePermission(Permission.STEPS_LOCK)
  @Post([
    'admin/enrolments/:enrolmentId/steps/:stepId/relock',
    'admin/enrolments/:enrolmentId/steps/:stepId/re-lock',
  ])
  async manualRelockStep(
    @Param('enrolmentId') enrolmentId: string,
    @Param('stepId') stepId: string,
    @Body() dto: StepOverrideDto,
    @Request() req: any,
  ) {
    const ip = req.ip ?? req.headers?.['x-forwarded-for'] ?? req.socket?.remoteAddress;
    return this.progressionService.manualRelockStep(
      enrolmentId,
      stepId,
      req.user,
      dto.reason,
      ip,
    );
  }

  @RequirePermission(Permission.STEPS_UNLOCK)
  @Post('admin/enrolments/:enrolmentId/steps/:stepId/reset-override')
  async resetStepOverride(
    @Param('enrolmentId') enrolmentId: string,
    @Param('stepId') stepId: string,
    @Body() dto: StepOverrideDto,
    @Request() req: any,
  ) {
    const ip = req.ip ?? req.headers?.['x-forwarded-for'] ?? req.socket?.remoteAddress;
    return this.progressionService.resetStepOverride(
      enrolmentId,
      stepId,
      req.user,
      dto.reason,
      ip,
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 5. STAFF OVERVIEW OF LESSONS PROGRESS (D1-035)
  // ─────────────────────────────────────────────────────────────────────────────

  @RequirePermission(Permission.STEPS_READ)
  @Get([
    'admin/enrolments/:enrolmentId/lessons',
    'enrolments/:enrolmentId/lessons',
  ])
  async getEnrolmentLessonsProgress(
    @Param('enrolmentId') enrolmentId: string,
    @Request() req: any,
  ) {
    return this.progressionService.getEnrolmentLessonsProgress(
      enrolmentId,
      req.user,
    );
  }
}

