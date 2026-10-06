import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Request,
} from '@nestjs/common';
import { QuizzesService } from './quizzes.service.js';
import { RequirePermission } from '../../common/decorators/require-permission.decorator.js';
import { Permission } from '../../config/permissions.config.js';
import {
  CreateQuizDto,
  ResetAttemptsDto,
  StartQuizDto,
  SubmitQuizDto,
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
}
