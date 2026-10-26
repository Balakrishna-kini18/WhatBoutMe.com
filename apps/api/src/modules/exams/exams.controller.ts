import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Request,
} from '@nestjs/common';
import { ExamsService } from './exams.service.js';
import { RequirePermission } from '../../common/decorators/require-permission.decorator.js';
import { Permission } from '../../config/permissions.config.js';
import {
  StartExamDto,
  SubmitExamDto,
  ResetExamAttemptsDto,
  CreateExamDto,
  UpdateExamDto,
  SaveExamAnswersDto,
} from './dto/index.js';

@Controller()
export class ExamsController {
  constructor(private readonly examsService: ExamsService) {}

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. PROGRAM EXAM CONFIGURATION
  // ─────────────────────────────────────────────────────────────────────────────

  @Get('programs/:programId/exam')
  getExamConfig(
    @Param('programId') programId: string,
    @Request() req: any,
  ) {
    return this.examsService.getExamConfig(programId, req?.user);
  }

  @Get('exams/programs/:programId')
  getExamConfigAlias(
    @Param('programId') programId: string,
    @Request() req: any,
  ) {
    return this.examsService.getExamConfig(programId, req?.user);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. LEARNER EXAM ATTEMPT LIFECYCLE
  // ─────────────────────────────────────────────────────────────────────────────

  @Post('exams/:id/start')
  start(
    @Param('id') id: string,
    @Request() req: any,
    @Body() dto?: StartExamDto,
  ) {
    return this.examsService.startExam(id, req?.user, dto);
  }

  @Post('exams/:id/submit')
  submit(
    @Param('id') id: string,
    @Body() dto: SubmitExamDto,
    @Request() req: any,
  ) {
    return this.examsService.submitExam(id, dto, req?.user);
  }

  @Get('exams/:id/attempt')
  getActiveAttempt(
    @Param('id') id: string,
    @Request() req: any,
  ) {
    return this.examsService.getActiveAttempt(id, req?.user);
  }

  @Patch('exams/:id/attempt/answers')
  saveAnswers(
    @Param('id') id: string,
    @Body() dto: SaveExamAnswersDto,
    @Request() req: any,
  ) {
    return this.examsService.saveExamAnswers(id, dto, req?.user);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. ADMIN EXAM BUILDER & PUBLISHING
  // ─────────────────────────────────────────────────────────────────────────────

  @RequirePermission(Permission.PROGRAMS_UPDATE)
  @Post('exams')
  createExam(
    @Body() dto: CreateExamDto,
    @Request() req: any,
  ) {
    return this.examsService.createExam(dto, req?.user);
  }

  @RequirePermission(Permission.PROGRAMS_UPDATE)
  @Patch('exams/:id')
  updateExam(
    @Param('id') id: string,
    @Body() dto: UpdateExamDto,
    @Request() req: any,
  ) {
    return this.examsService.updateExam(id, dto, req?.user);
  }

  @RequirePermission(Permission.PROGRAMS_UPDATE)
  @Post('exams/:id/publish')
  publishExam(
    @Param('id') id: string,
    @Request() req: any,
  ) {
    return this.examsService.publishExam(id, req?.user);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. ADMINISTRATIVE ATTEMPT RESET & SCOPED HISTORY
  // ─────────────────────────────────────────────────────────────────────────────

  @RequirePermission(Permission.QUIZZES_RESET_ATTEMPTS)
  @Post('exams/:id/admin/enrolments/:enrolmentId/reset-attempts')
  resetAttempts(
    @Param('id') id: string,
    @Param('enrolmentId') enrolmentId: string,
    @Body() dto: ResetExamAttemptsDto,
    @Request() req: any,
  ) {
    const ip = req?.ip || req?.headers?.['x-forwarded-for'];
    return this.examsService.resetExamAttempts(
      id,
      enrolmentId,
      dto,
      req?.user,
      ip,
    );
  }

  @RequirePermission(Permission.QUIZZES_READ)
  @Get('exams/:id/admin/enrolments/:enrolmentId/attempts')
  getEnrolmentAttempts(
    @Param('id') id: string,
    @Param('enrolmentId') enrolmentId: string,
    @Request() req: any,
  ) {
    return this.examsService.getEnrolmentExamAttempts(id, enrolmentId, req?.user);
  }
}
