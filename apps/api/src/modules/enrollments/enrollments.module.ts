import { Module } from '@nestjs/common';
import { EnrollmentsController, AdminEnrollmentsController } from './enrollments.controller.js';
import { EnrollmentsService } from './enrollments.service.js';
import { PrismaModule } from '../../prisma/prisma.module.js';

@Module({
  imports: [PrismaModule],
  controllers: [EnrollmentsController, AdminEnrollmentsController],
  providers: [EnrollmentsService],
  exports: [EnrollmentsService],
})
export class EnrollmentsModule {}
