import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { QuizzesService } from './quizzes.service.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { Role } from '@prisma/client';
import { IsString, IsNotEmpty, IsInt, IsOptional } from 'class-validator';

export class CreateQuizDto {
  @IsString() @IsNotEmpty() stepId: string;
  @IsOptional() @IsInt() passMark?: number;
}

export class UpdateQuizDto {
  @IsOptional() @IsString() @IsNotEmpty() stepId?: string;
  @IsOptional() @IsInt() passMark?: number;
}

@Controller('quizzes')
export class QuizzesController {
  constructor(private readonly quizzesService: QuizzesService) {}

  @Get()
  findAll() {
    return this.quizzesService.findAll();
  }

  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @Post()
  create(@Body() createDto: CreateQuizDto) {
    return this.quizzesService.create(createDto);
  }

  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @Patch(':id')
  update(@Param('id') id: string, @Body() updateDto: UpdateQuizDto) {
    return this.quizzesService.update(id, updateDto);
  }

  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.quizzesService.remove(id);
  }
}
