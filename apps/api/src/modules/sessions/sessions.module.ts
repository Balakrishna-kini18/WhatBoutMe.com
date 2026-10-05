import { Module } from '@nestjs/common';
import { SessionsController } from './sessions.controller.js';
import { SessionsService } from './sessions.service.js';
import { AttendanceController } from './attendance.controller.js';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { ZoomModule } from '../zoom/zoom.module.js';

@Module({
  imports: [PrismaModule, ZoomModule],
  controllers: [SessionsController, AttendanceController],
  providers: [SessionsService],
})
export class SessionsModule {}
