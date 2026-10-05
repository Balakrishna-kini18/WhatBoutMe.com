import { Controller, Get, Post, Body, Patch, Param, Delete, Request } from '@nestjs/common';
import { ProgramsService } from './programs.service.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { Role, ContentType } from '@prisma/client';
import { IsString, IsNotEmpty, IsNumber, IsBoolean, IsOptional, IsInt, IsEnum } from 'class-validator';

export class CreateProgramDto {
  @IsString() @IsNotEmpty() title: string;
  @IsString() @IsNotEmpty() slug: string;
  @IsOptional() @IsString() description?: string;
  @IsNumber() price: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdateProgramDto {
  @IsOptional() @IsString() @IsNotEmpty() title?: string;
  @IsOptional() @IsString() @IsNotEmpty() slug?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsNumber() price?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class CreateStepDto {
  @IsString() @IsNotEmpty() title: string;
  @IsOptional() @IsString() description?: string;
  @IsInt() sequence: number;
}

export class CreateLessonDto {
  @IsString() @IsNotEmpty() title: string;
  @IsEnum(ContentType) type: ContentType;
  @IsString() @IsNotEmpty() mediaUrl: string;
  @IsOptional() @IsInt() durationSec?: number;
}

@Controller('programs')
export class ProgramsController {
  constructor(private readonly programsService: ProgramsService) {}

  @Public()
  @Get()
  findAll() {
    return this.programsService.findAll();
  }

  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @Post()
  create(@Body() createDto: CreateProgramDto) {
    return this.programsService.create(createDto);
  }

  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @Patch(':id')
  update(@Param('id') id: string, @Body() updateDto: UpdateProgramDto) {
    return this.programsService.update(id, updateDto);
  }

  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.programsService.remove(id);
  }

  @Public()
  @Get(':id/steps')
  getSteps(@Param('id') id: string) {
    return this.programsService.getSteps(id);
  }

  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @Post(':id/steps')
  createStep(@Param('id') id: string, @Body() data: CreateStepDto) {
    return this.programsService.createStep(id, data);
  }

  // Learner: finished this step (video watched, quiz passed)
  @Post('steps/:stepId/complete')
  completeStep(@Param('stepId') stepId: string, @Body('score') score: unknown, @Request() req: any) {
    const value = typeof score === 'number' && score >= 0 && score <= 100 ? Math.round(score) : undefined;
    return this.programsService.completeStep(stepId, req.user.sub, value);
  }

  @Get('steps/:stepId')
  getStep(@Param('stepId') stepId: string) {
    return this.programsService.getStep(stepId);
  }

  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @Delete('steps/:stepId')
  removeStep(@Param('stepId') stepId: string) {
    return this.programsService.removeStep(stepId);
  }

  @Get('steps/:stepId/lessons')
  getLessons(@Param('stepId') stepId: string) {
    return this.programsService.getLessons(stepId);
  }

  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @Post('steps/:stepId/lessons')
  createLesson(@Param('stepId') stepId: string, @Body() data: CreateLessonDto) {
    return this.programsService.createLesson(stepId, data);
  }

  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @Delete('lessons/:lessonId')
  removeLesson(@Param('lessonId') lessonId: string) {
    return this.programsService.removeLesson(lessonId);
  }
}
