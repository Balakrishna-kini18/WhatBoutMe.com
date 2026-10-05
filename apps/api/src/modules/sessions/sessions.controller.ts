import { Controller, Get, Post, Delete, Body, Param, Query, Request } from '@nestjs/common';
import { SessionsService } from './sessions.service.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { Role } from '@prisma/client';
import { IsString, IsNotEmpty, IsDateString, IsOptional } from 'class-validator';

export class CreateSessionDto {
  @IsString() @IsNotEmpty() batchId: string;
  @IsString() @IsNotEmpty() title: string;
  @IsDateString() startTime: string;
  @IsDateString() endTime: string;
  @IsOptional() @IsString() joinUrl?: string;
  @IsOptional() @IsString() recordingUrl?: string;
  @IsOptional() @IsString() quizId?: string;
}

@Controller('sessions')
export class SessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  @Get()
  getSessions(@Query('batchId') batchId: string) {
    if (!batchId) return [];
    return this.sessionsService.getSessionsByBatch(batchId);
  }

  // Learner: their own sessions with attendance
  @Get('mine')
  getMySessions(@Request() req: any) {
    return this.sessionsService.getMySessions(req.user.sub);
  }

  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGER)
  @Get('all')
  getAllSessions() {
    return this.sessionsService.getAllSessions();
  }

  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @Post()
  createSession(@Body() body: CreateSessionDto) {
    return this.sessionsService.createSession(body);
  }

  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @Delete(':id')
  deleteSession(@Param('id') id: string) {
    return this.sessionsService.deleteSession(id);
  }

  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGER)
  @Get(':id/attendance')
  getAttendance(@Param('id') id: string, @Request() req: any) {
    return this.sessionsService.getAttendanceForSession(id, req.user);
  }

  // Learner checking themselves in
  @Post(':id/attend')
  markSelfAttendance(@Param('id') id: string, @Request() req: any) {
    return this.sessionsService.markAttendance(id, req.user.sub, false); // fix user id mapping
  }

  // Admin manually checking a learner in
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGER)
  @Post(':id/override-attendance')
  overrideAttendance(@Param('id') id: string, @Body('userId') userId: string) {
    return this.sessionsService.markAttendance(id, userId, true);
  }
}
