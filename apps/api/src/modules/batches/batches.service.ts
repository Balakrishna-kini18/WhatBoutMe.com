import { Injectable, ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';

@Injectable()
export class BatchesService {
  constructor(private prisma: PrismaService) {}

  async findAll(user: any) {
    const where = user.role === Role.MANAGER ? { managerId: user.sub } : {};
    const batches = await this.prisma.batch.findMany({
      where,
      include: {
        program: true,
        manager: true,
        enrolments: true,
      }
    });

    return batches.map(batch => ({
      id: batch.id,
      name: batch.name,
      program: batch.program?.title || 'Unknown Program',
      manager: batch.manager?.name || 'Unassigned',
      startDate: new Date(batch.startDate).toLocaleDateString(),
      students: batch.enrolments.length,
      status: 'Active',
    }));
  }

  async findOne(id: string, user: any) {
    const batch = await this.prisma.batch.findUnique({
      where: { id },
      include: {
        program: true,
        enrolments: {
          include: { user: true }
        }
      }
    });
    if (user.role === Role.MANAGER && batch?.managerId !== user.sub) {
      throw new ForbiddenException('You can only view your own batches');
    }
    return batch;
  }

  create(data: any) {
    return this.prisma.batch.create({ data });
  }

  update(id: string, data: any) {
    return this.prisma.batch.update({
      where: { id },
      data,
    });
  }

  remove(id: string) {
    return this.prisma.batch.delete({
      where: { id },
    });
  }
}
