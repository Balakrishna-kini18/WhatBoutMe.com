import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  Request,
} from '@nestjs/common';
import { ProgramsService } from './programs.service.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { PublicCache } from '../../common/decorators/cache-control.decorator.js';
import { RequirePermission } from '../../common/decorators/require-permission.decorator.js';
import { Permission } from '../../config/permissions.config.js';
import {
  CreateProgramDto,
  UpdateProgramDto,
  PublishProgramDto,
  CreateStepDto,
  UpdateStepDto,
  ReorderStepsDto,
  PublishStepDto,
  CreateLessonDto,
  UpdateLessonDto,
  ReorderLessonsDto,
  PublishLessonDto,
} from './dto/index.js';

@Controller('programs')
export class ProgramsController {
  constructor(private readonly programsService: ProgramsService) {}

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. PROGRAM COLLECTION
  // ─────────────────────────────────────────────────────────────────────────────

  @Public()
  @Get()
  findAll(@Request() req: any) {
    return this.programsService.findAll(req?.user?.role);
  }

  @Public()
  @PublicCache(60, 300)
  @Get('public')
  findPublic() {
    return this.programsService.findAll('USER');
  }

  @RequirePermission(Permission.PROGRAMS_CREATE)
  @Post()
  create(@Body() createDto: CreateProgramDto) {
    return this.programsService.create(createDto);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. STEP ROUTES (Literal 'steps/...' prefixes placed before ':id' routes)
  // ─────────────────────────────────────────────────────────────────────────────

  // Learner: complete step
  @Post('steps/:stepId/complete')
  completeStep(
    @Param('stepId') stepId: string,
    @Body('score') score: unknown,
    @Request() req: any,
  ) {
    const value =
      typeof score === 'number' && score >= 0 && score <= 100
        ? Math.round(score)
        : undefined;
    return this.programsService.completeStep(stepId, req.user.sub, value);
  }

  // Preview step with draft lessons and quiz content (requires authoring permission)
  @RequirePermission(Permission.STEPS_UPDATE)
  @Get('steps/:stepId/preview')
  previewStep(@Param('stepId') stepId: string) {
    return this.programsService.previewStep(stepId);
  }

  @RequirePermission(Permission.STEPS_UPDATE)
  @Patch('steps/:stepId/publish')
  publishStep(
    @Param('stepId') stepId: string,
    @Body() publishDto: PublishStepDto,
  ) {
    return this.programsService.publishStep(stepId, publishDto);
  }

  @RequirePermission(Permission.STEPS_UPDATE)
  @Patch('steps/:stepId')
  updateStep(
    @Param('stepId') stepId: string,
    @Body() updateDto: UpdateStepDto,
  ) {
    return this.programsService.updateStep(stepId, updateDto);
  }

  @RequirePermission(Permission.STEPS_DELETE)
  @Delete('steps/:stepId')
  removeStep(@Param('stepId') stepId: string) {
    return this.programsService.removeStep(stepId);
  }

  @PublicCache(60, 300)
  @Get('steps/:stepId/lessons')
  getLessons(@Param('stepId') stepId: string, @Request() req: any) {
    return this.programsService.getLessons(stepId, req?.user?.role);
  }

  @RequirePermission(Permission.CONTENT_CREATE)
  @Post('steps/:stepId/lessons')
  createLesson(
    @Param('stepId') stepId: string,
    @Body() data: CreateLessonDto,
  ) {
    return this.programsService.createLesson(stepId, data);
  }

  @RequirePermission(Permission.CONTENT_UPDATE)
  @Post('steps/:stepId/lessons/reorder')
  reorderLessons(
    @Param('stepId') stepId: string,
    @Body() dto: ReorderLessonsDto,
  ) {
    return this.programsService.reorderLessons(stepId, dto);
  }

  @PublicCache(60, 300)
  @Get('steps/:stepId')
  getStep(@Param('stepId') stepId: string, @Request() req: any) {
    return this.programsService.getStep(stepId, req?.user?.role);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. LESSON ROUTES (Literal 'lessons/...' prefixes placed before ':id' routes)
  // ─────────────────────────────────────────────────────────────────────────────

  // Preview lesson with draft content and mediaUrl (requires authoring permission)
  @RequirePermission(Permission.CONTENT_UPDATE)
  @Get('lessons/:lessonId/preview')
  previewLesson(@Param('lessonId') lessonId: string) {
    return this.programsService.previewLesson(lessonId);
  }

  @RequirePermission(Permission.CONTENT_UPDATE)
  @Patch('lessons/:lessonId/publish')
  publishLesson(
    @Param('lessonId') lessonId: string,
    @Body() publishDto: PublishLessonDto,
  ) {
    return this.programsService.publishLesson(lessonId, publishDto);
  }

  @RequirePermission(Permission.CONTENT_UPDATE)
  @Patch('lessons/:lessonId')
  updateLesson(
    @Param('lessonId') lessonId: string,
    @Body() updateDto: UpdateLessonDto,
  ) {
    return this.programsService.updateLesson(lessonId, updateDto);
  }

  @RequirePermission(Permission.CONTENT_DELETE)
  @Delete('lessons/:lessonId')
  removeLesson(@Param('lessonId') lessonId: string) {
    return this.programsService.removeLesson(lessonId);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. PROGRAM INSTANCE ROUTES (Parameterized ':id' routes)
  // ─────────────────────────────────────────────────────────────────────────────

  @Public()
  @PublicCache(60, 300)
  @Get(':id/steps')
  getSteps(@Param('id') id: string, @Request() req: any) {
    return this.programsService.getSteps(id, req?.user?.role);
  }

  @RequirePermission(Permission.STEPS_CREATE)
  @Post(':id/steps')
  createStep(@Param('id') id: string, @Body() data: CreateStepDto) {
    return this.programsService.createStep(id, data);
  }

  @RequirePermission(Permission.STEPS_UPDATE)
  @Post(':id/steps/reorder')
  reorderSteps(@Param('id') id: string, @Body() dto: ReorderStepsDto) {
    return this.programsService.reorderSteps(id, dto);
  }

  @RequirePermission(Permission.PROGRAMS_PUBLISH)
  @Patch(':id/publish')
  publishProgram(
    @Param('id') id: string,
    @Body() publishDto: PublishProgramDto,
    @Request() req: any,
  ) {
    const actorId = req?.user?.sub || req?.user?.id;
    return this.programsService.publishProgram(id, publishDto, actorId);
  }

  @Public()
  @PublicCache(60, 300)
  @Get(':id')
  findOne(@Param('id') id: string, @Request() req: any) {
    return this.programsService.findOne(id, req?.user?.role, req?.user?.sub || req?.user?.id);
  }

  @RequirePermission(Permission.PROGRAMS_UPDATE)
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateDto: UpdateProgramDto,
    @Request() req: any,
  ) {
    const actorId = req?.user?.sub || req?.user?.id;
    return this.programsService.update(id, updateDto, actorId);
  }

  @RequirePermission(Permission.PROGRAMS_CREATE)
  @Post(':id/duplicate')
  duplicate(@Param('id') id: string) {
    return this.programsService.duplicate(id);
  }

  @RequirePermission(Permission.PROGRAMS_DELETE)
  @Delete(':id')
  remove(@Param('id') id: string, @Query('force') force?: string) {
    return this.programsService.remove(id, force === 'true' || force === '1');
  }
}
