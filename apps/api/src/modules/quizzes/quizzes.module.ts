import { Module } from '@nestjs/common';
import { QuizzesService } from './quizzes.service.js';
import { QuizzesController } from './quizzes.controller.js';
import { PrismaModule } from '../../prisma/prisma.module.js';

@Module({
  imports: [PrismaModule],
  controllers: [QuizzesController],
  providers: [QuizzesService],
})
export class QuizzesModule {}
