import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
} from '@nestjs/common';
import { QuizzesService } from './quizzes.service.js';
import { RequirePermission } from '../../common/decorators/require-permission.decorator.js';
import { Permission } from '../../config/permissions.config.js';
import {
  CreateQuestionDto,
  CreateQuizDto,
  ResetAttemptsDto,
  StartQuizDto,
  SubmitQuizDto,
  UpdateQuestionDto,
  UpdateQuizDto,
} from './dto/index.js';

@Controller('quizzes')
export class QuizzesController {
  constructor(private readonly quizzesService: QuizzesService) {}

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. ADMINISTRATIVE CRUD
  // ─────────────────────────────────────────────────────────────────────────────

  @RequirePermission(Permission.QUIZZES_READ)
  @Get()
  findAll() {
    return this.quizzesService.findAll();
  }

  @RequirePermission(Permission.QUIZZES_READ)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.quizzesService.findOne(id);
  }

  @RequirePermission(Permission.QUIZZES_CREATE)
  @Post()
  create(@Body() createDto: CreateQuizDto) {
    return this.quizzesService.create(createDto);
  }

  @RequirePermission(Permission.QUIZZES_UPDATE)
  @Patch(':id')
  update(@Param('id') id: string, @Body() updateDto: UpdateQuizDto) {
    return this.quizzesService.update(id, updateDto);
  }

  @RequirePermission(Permission.QUIZZES_DELETE)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.quizzesService.remove(id);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. LEARNER SELF-SERVICE (ENGINE)
  // ─────────────────────────────────────────────────────────────────────────────

  @Post(':id/start')
  startQuiz(
    @Param('id') id: string,
    @Request() req: any,
    @Body() dto?: StartQuizDto,
  ) {
    return this.quizzesService.startQuiz(id, req.user, dto);
  }

  @Post(':id/submit')
  submitQuiz(
    @Param('id') id: string,
    @Request() req: any,
    @Body() dto: SubmitQuizDto,
  ) {
    return this.quizzesService.submitQuiz(id, req.user, dto);
  }

  @Get('attempts/active')
  getActiveAttemptByStep(
    @Query('stepId') stepId: string,
    @Query('quizId') quizId: string,
    @Request() req: any,
  ) {
    if (quizId) {
      return this.quizzesService.getActiveAttempt(quizId, req.user);
    }
    if (stepId) {
      return this.quizzesService.getActiveAttemptByStepId(stepId, req.user);
    }
    return null;
  }

  @Get(':id/attempt')
  getActiveAttempt(@Param('id') id: string, @Request() req: any) {
    return this.quizzesService.getActiveAttempt(id, req.user);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. ADMINISTRATIVE: ATTEMPTS & RESET (SCOPED)
  // ─────────────────────────────────────────────────────────────────────────────

  @RequirePermission(Permission.QUIZZES_RESET_ATTEMPTS)
  @Post(':id/admin/enrolments/:enrolmentId/reset-attempts')
  resetAttempts(
    @Param('id') id: string,
    @Param('enrolmentId') enrolmentId: string,
    @Request() req: any,
    @Body() dto: ResetAttemptsDto,
  ) {
    const ip = req.ip ?? req.headers?.['x-forwarded-for'] ?? req.socket?.remoteAddress;
    return this.quizzesService.resetQuizAttempts(id, enrolmentId, req.user, dto, ip);
  }

  @RequirePermission(Permission.QUIZZES_READ)
  @Get(':id/admin/enrolments/:enrolmentId/attempts')
  getEnrolmentAttempts(
    @Param('id') id: string,
    @Param('enrolmentId') enrolmentId: string,
    @Request() req: any,
  ) {
    return this.quizzesService.getEnrolmentQuizAttempts(id, enrolmentId, req.user);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. ADMINISTRATIVE: QUESTION BANK MANAGEMENT
  // ─────────────────────────────────────────────────────────────────────────────

  @RequirePermission(Permission.QUIZZES_READ)
  @Get(':id/questions')
  getQuestions(@Param('id') id: string) {
    return this.quizzesService.getQuestionsForQuiz(id);
  }

  @RequirePermission(Permission.QUIZZES_CREATE)
  @Post(':id/questions')
  createQuestion(@Param('id') id: string, @Body() dto: CreateQuestionDto) {
    return this.quizzesService.createQuestionForQuiz(id, dto);
  }

  @RequirePermission(Permission.QUIZZES_UPDATE)
  @Patch('questions/:questionId')
  updateQuestion(
    @Param('questionId') questionId: string,
    @Body() dto: UpdateQuestionDto,
  ) {
    return this.quizzesService.updateQuestion(questionId, dto);
  }

  @RequirePermission(Permission.QUIZZES_DELETE)
  @Delete('questions/:questionId')
  deleteQuestion(
    @Param('questionId') questionId: string,
    @Query('force') force?: string,
  ) {
    const isForce = force === 'true' || force === '1';
    return isForce
      ? this.quizzesService.deleteQuestion(questionId, true)
      : this.quizzesService.deleteQuestion(questionId);
  }

  @RequirePermission(Permission.QUIZZES_DELETE)
  @Delete(':quizId/questions/:questionId')
  deleteQuizQuestion(
    @Param('questionId') questionId: string,
    @Query('force') force?: string,
  ) {
    const isForce = force === 'true' || force === '1';
    return isForce
      ? this.quizzesService.deleteQuestion(questionId, true)
      : this.quizzesService.deleteQuestion(questionId);
  }
}

