import { Module } from '@nestjs/common';
import { QuizzesService } from './quizzes.service.js';
import { QuizzesController } from './quizzes.controller.js';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { CacheHelperModule } from '../../common/cache/cache-helper.module.js';
import { ProgressionModule } from '../progression/progression.module.js';

@Module({
  imports: [PrismaModule, CacheHelperModule, ProgressionModule],
  controllers: [QuizzesController],
  providers: [QuizzesService],
  exports: [QuizzesService],
})
export class QuizzesModule {}
