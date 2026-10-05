import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';

@Injectable()
export class QuizzesService {
  constructor(private prisma: PrismaService) {}

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

  create(data: any) {
    return this.prisma.quiz.create({ data });
  }

  update(id: string, data: any) {
    return this.prisma.quiz.update({
      where: { id },
      data,
    });
  }

  remove(id: string) {
    return this.prisma.quiz.delete({
      where: { id },
    });
  }
}
