import { Module } from '@nestjs/common';
import { OralAssessmentsService } from './oral-assessments.service.js';
import { OralAssessmentsController } from './oral-assessments.controller.js';
import { PrismaModule } from '../../prisma/prisma.module.js';

@Module({
  imports: [PrismaModule],
  controllers: [OralAssessmentsController],
  providers: [OralAssessmentsService],
  exports: [OralAssessmentsService],
})
export class OralAssessmentsModule {}
