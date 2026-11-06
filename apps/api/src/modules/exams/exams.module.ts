import { Module } from '@nestjs/common';
import { ExamsService } from './exams.service.js';
import { ExamsController } from './exams.controller.js';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { CacheHelperModule } from '../../common/cache/cache-helper.module.js';
import { ProgressionModule } from '../progression/progression.module.js';
import { AttendanceComplianceService } from '../sessions/attendance-compliance.service.js';

@Module({
  imports: [PrismaModule, CacheHelperModule, ProgressionModule],
  controllers: [ExamsController],
  providers: [ExamsService, AttendanceComplianceService],
  exports: [ExamsService],
})
export class ExamsModule {}
