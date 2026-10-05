import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { EnrolmentStatus } from '@prisma/client';
import { CacheHelperService } from '../../common/cache/cache-helper.service.js';

@Injectable()
export class EnrollmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheHelper: CacheHelperService
  ) {}

  async mockCheckout(userId: string, programId: string) {
    if (process.env.NODE_ENV === 'production' && process.env.PAYMENT_MODE !== 'stripe') {
      throw new BadRequestException('Mock checkout not allowed in production');
    }

    const program = await this.prisma.program.findUnique({
      where: { id: programId }
    });
    if (!program) throw new BadRequestException('Program not found');

    const res = await this.prisma.$transaction(async (tx) => {
      // Find or create batch
      let batch = await tx.batch.findFirst({
        where: { programId }
      });

      if (!batch) {
        batch = await tx.batch.create({
          data: {
            name: 'Default Cohort',
            programId,
            capacity: 100,
            startDate: new Date()
          }
        });
      }

      // Create or update enrolment atomically
      const enrolment = await tx.enrolment.upsert({
        where: {
          userId_programId: {
            userId,
            programId,
          }
        },
        update: {
          status: 'ACTIVE' as EnrolmentStatus,
        },
        create: {
          userId,
          batchId: batch.id,
          programId,
          status: 'ACTIVE' as EnrolmentStatus,
        }
      });

      return enrolment;
    });

    await this.cacheHelper.invalidateNamespace(`auth_user:${userId}`);
    await this.cacheHelper.invalidateNamespace('batches');

    return res;
  }
}

