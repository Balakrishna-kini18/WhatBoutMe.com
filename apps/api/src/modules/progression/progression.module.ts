import { Module, forwardRef } from '@nestjs/common';
import { ProgressionController } from './progression.controller.js';
import { LessonProgressController } from './lesson-progress.controller.js';
import { ProgressionService } from './progression.service.js';
import { StageGateService } from './stage-gate.service.js';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { SessionsModule } from '../sessions/sessions.module.js';

@Module({
  imports: [PrismaModule, forwardRef(() => SessionsModule)],
  controllers: [ProgressionController, LessonProgressController],
  providers: [ProgressionService, StageGateService],
  exports: [ProgressionService, StageGateService],
})
export class ProgressionModule {}
