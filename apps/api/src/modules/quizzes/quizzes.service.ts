import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CacheHelperService } from '../../common/cache/cache-helper.service.js';

@Injectable()
export class QuizzesService {
  constructor(
    private prisma: PrismaService,
    private cacheHelper: CacheHelperService
  ) {}

  async findAll() {
    const quizzes = await this.prisma.quiz.findMany({
      include: {
        step: true,
        questions: true,
      }
    });

    return quizzes.map(quiz => ({
      id: quiz.id,
      step: `Step ${quiz.step.sequence}: ${quiz.step.title}`,
      questions: quiz.questions.length,
      passMark: `${quiz.passMark}%`,
      updated: new Date(quiz.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    }));
  }

  async create(data: any) {
    const res = await this.prisma.quiz.create({ data });
    await this.cacheHelper.invalidateNamespace('programs');
    return res;
  }

  async update(id: string, data: any) {
    const res = await this.prisma.quiz.update({
      where: { id },
      data,
    });
    await this.cacheHelper.invalidateNamespace('programs');
    return res;
  }

  async remove(id: string) {
    const res = await this.prisma.quiz.delete({
      where: { id },
    });
    await this.cacheHelper.invalidateNamespace('programs');
    return res;
  }
}
