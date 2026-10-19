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
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { NotesService } from './notes.service.js';
import { CreateNoteDto, QueryNotesDto, UpdateNoteDto } from './dto/index.js';

@Controller('notes')
@UseGuards(JwtAuthGuard)
export class NotesController {
  constructor(private readonly notesService: NotesService) {}

  @Post()
  create(@Request() req: any, @Body() dto: CreateNoteDto) {
    const userId = req.user?.sub || req.user?.id;
    return this.notesService.create(userId, dto);
  }

  @Get()
  findAll(@Request() req: any, @Query() query: QueryNotesDto) {
    const callerId = req.user?.sub || req.user?.id;
    const role = req.user?.role;
    const targetUserId =
      (role === 'ADMIN' || role === 'SUPER_ADMIN' || role === 'MANAGER') && query.userId
        ? query.userId
        : callerId;
    return this.notesService.findAll(targetUserId, query);
  }

  @Get('lessons/:lessonId')
  findByLesson(
    @Request() req: any,
    @Param('lessonId') lessonId: string,
  ) {
    const userId = req.user?.sub || req.user?.id;
    return this.notesService.findByLesson(userId, lessonId);
  }

  @Get(':id')
  findOne(@Request() req: any, @Param('id') id: string) {
    const userId = req.user?.sub || req.user?.id;
    return this.notesService.findOne(userId, id);
  }

  @Patch(':id')
  update(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateNoteDto,
  ) {
    const userId = req.user?.sub || req.user?.id;
    return this.notesService.update(userId, id, dto);
  }

  @Delete(':id')
  delete(@Request() req: any, @Param('id') id: string) {
    const userId = req.user?.sub || req.user?.id;
    return this.notesService.delete(userId, id);
  }
}
