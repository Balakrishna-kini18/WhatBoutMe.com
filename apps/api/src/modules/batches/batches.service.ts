import { Injectable, ForbiddenException, Inject } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CacheHelperService } from '../../common/cache/cache-helper.service.js';

@Injectable()
export class BatchesService {
  constructor(
    private prisma: PrismaService,
    private cacheHelper: CacheHelperService
  ) {}

  async findAll(user: any) {
    const cacheKey = await this.cacheHelper.getEndpointKey('batches', user.role, { action: 'findAll', userId: user.role === Role.MANAGER ? user.sub : undefined });
    return this.cacheHelper.getOrSet(cacheKey, async () => {
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
    });
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

  async create(data: any) {
    const res = await this.prisma.batch.create({ data });
    await this.cacheHelper.invalidateNamespace('batches');
    return res;
  }

  async update(id: string, data: any) {
    const res = await this.prisma.batch.update({
      where: { id },
      data,
    });
    await this.cacheHelper.invalidateNamespace('batches');
    return res;
  }

  async remove(id: string) {
    const res = await this.prisma.batch.delete({
      where: { id },
    });
    await this.cacheHelper.invalidateNamespace('batches');
    return res;
  }
}
