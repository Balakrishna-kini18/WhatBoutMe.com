import { Module } from '@nestjs/common';
import { ProgressionController } from './progression.controller.js';
import { LessonProgressController } from './lesson-progress.controller.js';
import { ProgressionService } from './progression.service.js';
import { PrismaModule } from '../../prisma/prisma.module.js';

@Module({
  imports: [PrismaModule],
  controllers: [ProgressionController, LessonProgressController],
  providers: [ProgressionService],
  exports: [ProgressionService],
})
export class ProgressionModule {}
