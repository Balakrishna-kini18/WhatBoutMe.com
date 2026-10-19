import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { BatchStatus, Role, EnrolmentStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CacheHelperService } from '../../common/cache/cache-helper.service.js';
import {
  CreateBatchDto,
  UpdateBatchDto,
  TransitionBatchStatusDto,
  AssignTrainerDto,
  QueryBatchesDto,
} from './dto/index.js';

@Injectable()
export class BatchesService {
  private readonly logger = new Logger(BatchesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheHelper: CacheHelperService,
  ) {}

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. QUERY & RETRIEVAL
  // ─────────────────────────────────────────────────────────────────────────────

  async findAll(user: any, query?: QueryBatchesDto) {
    const isManagerOrTeacher = user?.role === Role.MANAGER || user?.role === 'MANAGER' || user?.role === 'TEACHER';
    const userId = user?.sub ?? user?.id;

    const cacheKey = await this.cacheHelper.getEndpointKey(
      'batches',
      (user?.role as any) || 'GUEST',
      {
        action: 'findAll',
        userId: isManagerOrTeacher ? userId : undefined,
        programId: query?.programId,
        status: query?.status,
      },
    );

    return this.cacheHelper.getOrSet(cacheKey, async () => {
      const where: any = {};

      if (isManagerOrTeacher) {
        where.OR = [
          { managerId: userId },
          { trainers: { some: { trainerId: userId } } },
        ];
      }

      if (query?.programId) {
        where.programId = query.programId;
      }

      if (query?.status) {
        where.status = query.status;
      } else {
        where.status = { not: 'ARCHIVED' };
      }

      // Auto-transition batches whose startDate has arrived to ACTIVE
      // and batches whose endDate has passed to COMPLETED
      const now = new Date();
      const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      if (typeof (this.prisma.batch as any)?.updateMany === 'function') {
        await this.prisma.batch.updateMany({
          where: {
            status: BatchStatus.UPCOMING,
            startDate: { lte: endOfToday },
          },
          data: {
            status: BatchStatus.ACTIVE,
          },
        }).catch(() => {});

        await this.prisma.batch.updateMany({
          where: {
            status: BatchStatus.ACTIVE,
            endDate: { lt: now, not: null },
          },
          data: {
            status: BatchStatus.COMPLETED,
          },
        }).catch(() => {});
      }

      const batches = await this.prisma.batch.findMany({
        where,
        include: {
          program: {
            select: { id: true, title: true, slug: true, status: true },
          },
          manager: {
            select: { id: true, name: true, email: true, role: true },
          },
          trainers: {
            include: {
              trainer: {
                select: { id: true, name: true, email: true, role: true },
              },
            },
          },
          _count: {
            select: { enrolments: true },
          },
        },
        orderBy: { startDate: 'desc' },
      });

      return batches.map((batch) => this.formatBatchResponse(batch));
    });
  }

  async findOne(id: string, user: any) {
    const isManagerOrTeacher = user?.role === Role.MANAGER || user?.role === 'MANAGER' || user?.role === 'TEACHER';
    const userId = user?.sub ?? user?.id;

    const cacheKey = await this.cacheHelper.getEndpointKey(
      'batches',
      (user?.role as any) || 'GUEST',
      { action: 'findOne', id, userId: isManagerOrTeacher ? userId : undefined },
    );

    return this.cacheHelper.getOrSet(cacheKey, async () => {
      const batch = await this.prisma.batch.findUnique({
        where: { id },
        include: {
          program: {
            select: { id: true, title: true, slug: true, status: true },
          },
          manager: {
            select: { id: true, name: true, email: true, role: true },
          },
          trainers: {
            include: {
              trainer: {
                select: { id: true, name: true, email: true, role: true },
              },
            },
          },
          enrolments: {
            where: {
              status: { not: EnrolmentStatus.REVOKED },
            },
            select: {
              id: true,
              userId: true,
              status: true,
              createdAt: true,
              user: {
                select: { id: true, name: true, email: true, role: true },
              },
            },
          },
          _count: {
            select: { enrolments: true },
          },
        },
      });

      if (!batch) {
        throw new NotFoundException('Batch not found');
      }

      if (isManagerOrTeacher) {
        const isAssigned =
          batch.managerId === userId ||
          batch.trainers.some((t) => t.trainerId === userId);

        if (!isAssigned) {
          throw new ForbiddenException(
            'Access denied: You are not assigned to this batch',
          );
        }
      }

      return this.formatBatchResponse(batch);
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. CREATION & MUTATION
  // ─────────────────────────────────────────────────────────────────────────────

  async create(data: CreateBatchDto) {
    // 1-4. Parallelize independent validation queries concurrently in a single round-trip
    const [program, existing, manager, trainers] = await Promise.all([
      this.prisma.program.findUnique({
        where: { id: data.programId },
      }),
      typeof this.prisma.batch?.findFirst === 'function'
        ? this.prisma.batch.findFirst({
            where: {
              programId: data.programId,
              name: { equals: data.name.trim(), mode: 'insensitive' },
              status: { not: BatchStatus.ARCHIVED },
            },
          })
        : Promise.resolve(null),
      data.managerId
        ? this.prisma.user.findUnique({
            where: { id: data.managerId },
          })
        : Promise.resolve(null),
      data.trainerIds && data.trainerIds.length > 0
        ? this.prisma.user.findMany({
            where: { id: { in: data.trainerIds } },
          })
        : Promise.resolve([]),
    ]);

    if (!program) {
      throw new NotFoundException('Program not found');
    }

    if (existing) {
      throw new ConflictException(
        `A batch named "${data.name.trim()}" already exists in the selected program`,
      );
    }

    if (data.capacity < 1) {
      throw new BadRequestException('Capacity must be at least 1');
    }

    if (data.managerId) {
      if (!manager) {
        throw new NotFoundException('Manager user not found');
      }
      if (manager.role === Role.USER) {
        throw new BadRequestException(
          'Assigned manager must have a manager or staff role',
        );
      }
    }

    if (data.trainerIds && data.trainerIds.length > 0) {
      if (trainers.length !== data.trainerIds.length) {
        throw new NotFoundException('One or more specified trainers not found');
      }
      for (const t of trainers) {
        if (t.role === Role.USER) {
          throw new BadRequestException(
            `User ${t.name} cannot be assigned as trainer because they have USER role`,
          );
        }
      }
    }

    // Determine initial status based on startDate / endDate if not explicitly provided
    const now = new Date();
    const todayStartMs = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const batchStart = new Date(data.startDate);
    const batchStartDayMs = new Date(batchStart.getFullYear(), batchStart.getMonth(), batchStart.getDate()).getTime();
    const nowMs = now.getTime();
    const startMs = batchStart.getTime();
    const endMs = data.endDate ? new Date(data.endDate).getTime() : null;
    let initialStatus = data.status;
    if (!initialStatus) {
      if (endMs && endMs < nowMs) {
        initialStatus = BatchStatus.COMPLETED;
      } else if (startMs <= nowMs || batchStartDayMs <= todayStartMs) {
        initialStatus = BatchStatus.ACTIVE;
      } else {
        initialStatus = BatchStatus.UPCOMING;
      }
    }

    // 5. Execute creation inside transaction
    const created = await this.prisma.$transaction(async (tx) => {
      const batch = await tx.batch.create({
        data: {
          name: data.name,
          programId: data.programId,
          managerId: data.managerId ?? null,
          startDate: new Date(data.startDate),
          endDate: data.endDate ? new Date(data.endDate) : null,
          capacity: data.capacity,
          status: initialStatus,
          price: data.price !== undefined ? data.price : undefined,
          currency: data.currency !== undefined ? data.currency : undefined,
          priceUSD: data.priceUSD !== undefined ? data.priceUSD : undefined,
          priceAED: data.priceAED !== undefined ? data.priceAED : undefined,
          priceINR: data.priceINR !== undefined ? data.priceINR : undefined,
        },
      });

      if (data.trainerIds && data.trainerIds.length > 0) {
        if (typeof (tx as any).batchTrainer?.createMany === 'function') {
          await (tx as any).batchTrainer.createMany({
            data: data.trainerIds.map((trainerId) => ({
              batchId: batch.id,
              trainerId,
            })),
          });
        } else {
          await Promise.all(
            data.trainerIds.map((trainerId) =>
              tx.batchTrainer.create({
                data: {
                  batchId: batch.id,
                  trainerId,
                },
              }),
            ),
          );
        }
      }

      return tx.batch.findUnique({
        where: { id: batch.id },
        include: {
          program: { select: { id: true, title: true, slug: true } },
          manager: {
            select: { id: true, name: true, email: true, role: true },
          },
          trainers: {
            include: {
              trainer: {
                select: { id: true, name: true, email: true, role: true },
              },
            },
          },
          _count: { select: { enrolments: true } },
        },
      });
    });

    await this.cacheHelper.invalidateNamespace('batches');
    return this.formatBatchResponse(created!);
  }

  async update(id: string, data: UpdateBatchDto) {
    const batch = await this.prisma.batch.findUnique({ where: { id } });
    if (!batch) {
      throw new NotFoundException('Batch not found');
    }

    // 1. Validate Program if being changed
    if (data.programId) {
      const program = await this.prisma.program.findUnique({
        where: { id: data.programId },
      });
      if (!program) {
        throw new NotFoundException('Program not found');
      }
    }

    // 2. Validate Manager if being changed
    if (data.managerId !== undefined) {
      if (data.managerId !== null) {
        const manager = await this.prisma.user.findUnique({
          where: { id: data.managerId },
        });
        if (!manager) {
          throw new NotFoundException('Manager user not found');
        }
        if (manager.role === Role.USER) {
          throw new BadRequestException(
            'Assigned manager must have a manager or staff role',
          );
        }
      }
    }

    // 3. Validate capacity against existing enrollment count
    if (data.capacity !== undefined) {
      if (data.capacity < 1) {
        throw new BadRequestException('Capacity must be at least 1');
      }

      const enrolledCount = await this.prisma.enrolment.count({
        where: { batchId: id, status: { not: EnrolmentStatus.REVOKED } },
      });

      if (data.capacity < enrolledCount) {
        throw new BadRequestException(
          `Cannot reduce capacity to ${data.capacity} because ${enrolledCount} learners are currently enrolled`,
        );
      }
    }

    const updateData: any = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.programId !== undefined) updateData.programId = data.programId;
    if (data.managerId !== undefined) updateData.managerId = data.managerId;
    if (data.startDate !== undefined)
      updateData.startDate = new Date(data.startDate);
    if (data.endDate !== undefined)
      updateData.endDate = data.endDate ? new Date(data.endDate) : null;
    if (data.capacity !== undefined) updateData.capacity = data.capacity;
    if (data.price !== undefined) updateData.price = data.price;
    if (data.currency !== undefined) updateData.currency = data.currency;
    if (data.priceUSD !== undefined) updateData.priceUSD = data.priceUSD;
    if (data.priceAED !== undefined) updateData.priceAED = data.priceAED;
    if (data.priceINR !== undefined) updateData.priceINR = data.priceINR;
    if (data.status !== undefined) {
      updateData.status = data.status;
    } else if (batch.status === BatchStatus.UPCOMING || batch.status === BatchStatus.ACTIVE) {
      const now = new Date();
      const todayStartMs = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      const effectiveStart = updateData.startDate ?? batch.startDate;
      const effectiveStartDayMs = new Date(effectiveStart.getFullYear(), effectiveStart.getMonth(), effectiveStart.getDate()).getTime();
      const nowMs = now.getTime();
      const startMs = effectiveStart.getTime();
      const endMs = updateData.endDate !== undefined
        ? (updateData.endDate ? updateData.endDate.getTime() : null)
        : (batch.endDate ? batch.endDate.getTime() : null);

      if (endMs && endMs < nowMs) {
        updateData.status = BatchStatus.COMPLETED;
      } else if (startMs <= nowMs || effectiveStartDayMs <= todayStartMs) {
        updateData.status = BatchStatus.ACTIVE;
      } else {
        updateData.status = BatchStatus.UPCOMING;
      }
    }

    const updated = await this.prisma.batch.update({
      where: { id },
      data: updateData,
      include: {
        program: { select: { id: true, title: true, slug: true } },
        manager: {
          select: { id: true, name: true, email: true, role: true },
        },
        trainers: {
          include: {
            trainer: {
              select: { id: true, name: true, email: true, role: true },
            },
          },
        },
        _count: { select: { enrolments: true } },
      },
    });

    await this.cacheHelper.invalidateNamespace('batches');
    return this.formatBatchResponse(updated);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. LIFECYCLE TRANSITIONS
  // ─────────────────────────────────────────────────────────────────────────────

  async transitionStatus(id: string, dto: TransitionBatchStatusDto) {
    const batch = await this.prisma.batch.findUnique({ where: { id } });
    if (!batch) {
      throw new NotFoundException('Batch not found');
    }

    const currentStatus = batch.status;
    const targetStatus = dto.status;

    // Idempotent no-op
    if (currentStatus === targetStatus) {
      return this.findOne(id, { role: Role.ADMIN });
    }

    // Validate state machine transitions:
    // UPCOMING -> ACTIVE | ARCHIVED
    // ACTIVE   -> COMPLETED | ARCHIVED
    // COMPLETED -> ARCHIVED
    // ARCHIVED -> (terminal)
    const allowedTransitions: Record<BatchStatus, BatchStatus[]> = {
      [BatchStatus.UPCOMING]: [BatchStatus.ACTIVE, BatchStatus.ARCHIVED],
      [BatchStatus.ACTIVE]: [BatchStatus.COMPLETED, BatchStatus.ARCHIVED],
      [BatchStatus.COMPLETED]: [BatchStatus.ARCHIVED],
      [BatchStatus.ARCHIVED]: [],
    };

    const allowed = allowedTransitions[currentStatus] || [];
    if (!allowed.includes(targetStatus)) {
      throw new BadRequestException(
        `Invalid batch lifecycle transition from ${currentStatus} to ${targetStatus}`,
      );
    }

    const updateData: any = { status: targetStatus };
    if (targetStatus === BatchStatus.COMPLETED && !batch.endDate) {
      updateData.endDate = new Date();
    }

    const updated = await this.prisma.batch.update({
      where: { id },
      data: updateData,
      include: {
        program: { select: { id: true, title: true, slug: true } },
        manager: {
          select: { id: true, name: true, email: true, role: true },
        },
        trainers: {
          include: {
            trainer: {
              select: { id: true, name: true, email: true, role: true },
            },
          },
        },
        _count: { select: { enrolments: true } },
      },
    });

    await this.cacheHelper.invalidateNamespace('batches');
    return this.formatBatchResponse(updated);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. TRAINER ASSIGNMENT
  // ─────────────────────────────────────────────────────────────────────────────

  async assignTrainer(batchId: string, dto: AssignTrainerDto) {
    const batch = await this.prisma.batch.findUnique({
      where: { id: batchId },
    });
    if (!batch) {
      throw new NotFoundException('Batch not found');
    }

    const trainer = await this.prisma.user.findUnique({
      where: { id: dto.trainerId },
    });
    if (!trainer) {
      throw new NotFoundException('Trainer user not found');
    }

    if (trainer.role === Role.USER) {
      throw new BadRequestException(
        'Assigned trainer must have a manager or staff role',
      );
    }

    // Idempotent assignment
    const assignment = await this.prisma.batchTrainer.upsert({
      where: {
        batchId_trainerId: {
          batchId,
          trainerId: dto.trainerId,
        },
      },
      create: {
        batchId,
        trainerId: dto.trainerId,
      },
      update: {},
      include: {
        trainer: {
          select: { id: true, name: true, email: true, role: true },
        },
      },
    });

    await this.cacheHelper.invalidateNamespace('batches');
    return {
      batchId,
      trainerId: dto.trainerId,
      trainer: assignment.trainer,
      assigned: true,
    };
  }

  async removeTrainer(batchId: string, trainerId: string) {
    const batch = await this.prisma.batch.findUnique({
      where: { id: batchId },
    });
    if (!batch) {
      throw new NotFoundException('Batch not found');
    }

    const existing = await this.prisma.batchTrainer.findUnique({
      where: {
        batchId_trainerId: {
          batchId,
          trainerId,
        },
      },
    });

    if (!existing) {
      throw new NotFoundException('Trainer assignment not found for this batch');
    }

    await this.prisma.batchTrainer.delete({
      where: {
        batchId_trainerId: {
          batchId,
          trainerId,
        },
      },
    });

    await this.cacheHelper.invalidateNamespace('batches');
    return {
      batchId,
      trainerId,
      removed: true,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 5. ARCHIVE & REMOVE
  // ─────────────────────────────────────────────────────────────────────────────

  async remove(id: string) {
    const batch = await this.prisma.batch.findUnique({ where: { id } });
    if (!batch) {
      await this.cacheHelper.invalidateNamespace('batches');
      return { id, deleted: true };
    }

    // 1. Gather all sessions in this batch for Zoom cancel events & attendance cleanup
    const sessions = await this.prisma.session.findMany({
      where: { batchId: id },
      select: { id: true, providerMeetingId: true },
    });
    const sessionIds = sessions.map((s) => s.id);

    // 2. Execute full relational cleanup inside transaction with extended timeout
    await this.prisma.$transaction(
      async (tx) => {
        if (sessionIds.length > 0) {
          // Attendance records
          if (typeof (tx as any).attendance?.deleteMany === 'function') {
            await (tx as any).attendance.deleteMany({
              where: { sessionId: { in: sessionIds } },
            });
          }

          // Unmatched attendances
          if (typeof (tx as any).unmatchedAttendance?.deleteMany === 'function') {
            await (tx as any).unmatchedAttendance.deleteMany({
              where: { sessionId: { in: sessionIds } },
            });
          }

          // Session bookings
          if (typeof (tx as any).sessionBooking?.deleteMany === 'function') {
            await (tx as any).sessionBooking.deleteMany({
              where: { sessionId: { in: sessionIds } },
            });
          }

          // Sessions
          if (typeof (tx as any).session?.deleteMany === 'function') {
            await (tx as any).session.deleteMany({
              where: { id: { in: sessionIds } },
            });
          }
        }

        // 3. Clean up enrolments and all nested progress/attempts
        const enrolments =
          typeof (tx as any).enrolment?.findMany === 'function'
            ? await (tx as any).enrolment.findMany({
                where: { batchId: id },
                select: { id: true },
              })
            : [];
        const enrolmentIds = enrolments.map((e: any) => e.id);

        if (enrolmentIds.length > 0) {
          if (typeof (tx as any).attendance?.deleteMany === 'function') {
            await (tx as any).attendance.deleteMany({ where: { enrolmentId: { in: enrolmentIds } } });
          }
          if (typeof (tx as any).unmatchedAttendance?.deleteMany === 'function') {
            await (tx as any).unmatchedAttendance.deleteMany({ where: { linkedEnrolmentId: { in: enrolmentIds } } });
          }
          if (typeof (tx as any).sessionBooking?.deleteMany === 'function') {
            await (tx as any).sessionBooking.deleteMany({ where: { enrolmentId: { in: enrolmentIds } } });
          }
          if (typeof (tx as any).attempt?.deleteMany === 'function') {
            await (tx as any).attempt.deleteMany({ where: { enrolmentId: { in: enrolmentIds } } });
          }
          if (typeof (tx as any).examAttempt?.deleteMany === 'function') {
            await (tx as any).examAttempt.deleteMany({ where: { enrolmentId: { in: enrolmentIds } } });
          }
          if (typeof (tx as any).oralAssessment?.deleteMany === 'function') {
            await (tx as any).oralAssessment.deleteMany({ where: { enrolmentId: { in: enrolmentIds } } });
          }
          if (typeof (tx as any).userLessonProgress?.deleteMany === 'function') {
            await (tx as any).userLessonProgress.deleteMany({ where: { enrolmentId: { in: enrolmentIds } } });
          }
          if (typeof (tx as any).stepProgress?.deleteMany === 'function') {
            await (tx as any).stepProgress.deleteMany({ where: { enrolmentId: { in: enrolmentIds } } });
          }
          if (typeof (tx as any).signedAgreement?.deleteMany === 'function') {
            await (tx as any).signedAgreement.deleteMany({ where: { enrolmentId: { in: enrolmentIds } } });
          }
          if (typeof (tx as any).certificate?.deleteMany === 'function') {
            await (tx as any).certificate.deleteMany({ where: { enrolmentId: { in: enrolmentIds } } });
          }
          if (typeof (tx as any).couponRedemption?.deleteMany === 'function') {
            await (tx as any).couponRedemption.deleteMany({ where: { enrolmentId: { in: enrolmentIds } } });
          }

          // Invoices linked to payments must be deleted before deleting payments
          if (typeof (tx as any).payment?.findMany === 'function') {
            const payments = await (tx as any).payment.findMany({
              where: { enrolmentId: { in: enrolmentIds } },
              select: { id: true },
            });
            const paymentIds = payments.map((p: any) => p.id);
            if (paymentIds.length > 0 && typeof (tx as any).invoice?.deleteMany === 'function') {
              await (tx as any).invoice.deleteMany({ where: { paymentId: { in: paymentIds } } });
            }
          }
          if (typeof (tx as any).payment?.deleteMany === 'function') {
            await (tx as any).payment.deleteMany({ where: { enrolmentId: { in: enrolmentIds } } });
          }
          if (typeof (tx as any).enrolment?.deleteMany === 'function') {
            await (tx as any).enrolment.deleteMany({ where: { id: { in: enrolmentIds } } });
          }
        }

        // 4. Clean up batch metadata relations
        if (typeof (tx as any).batchTrainer?.deleteMany === 'function') {
          await (tx as any).batchTrainer.deleteMany({ where: { batchId: id } });
        }
        if (typeof (tx as any).batchStepOverride?.deleteMany === 'function') {
          await (tx as any).batchStepOverride.deleteMany({ where: { batchId: id } });
        }
        if (typeof (tx as any).batchAnnouncement?.deleteMany === 'function') {
          await (tx as any).batchAnnouncement.deleteMany({ where: { batchId: id } });
        }

        // Clean up conversations and messages
        if (typeof (tx as any).conversation?.findMany === 'function') {
          const convs = await (tx as any).conversation.findMany({
            where: { batchId: id },
            select: { id: true },
          });
          const convIds = convs.map((c: any) => c.id);
          if (convIds.length > 0) {
            if (typeof (tx as any).message?.deleteMany === 'function') {
              await (tx as any).message.deleteMany({ where: { conversationId: { in: convIds } } });
            }
            await (tx as any).conversation.deleteMany({ where: { id: { in: convIds } } });
          }
        }

        if (typeof (tx as any).resource?.deleteMany === 'function') {
          await (tx as any).resource.deleteMany({ where: { batchId: id } });
        }
        if (typeof (tx as any).resourceItem?.deleteMany === 'function') {
          await (tx as any).resourceItem.deleteMany({ where: { batchId: id } });
        }

        // 5. Clean delete batch record
        await tx.batch.delete({ where: { id } });
      },
      {
        maxWait: 15000,
        timeout: 30000,
      }
    );

    // 3. Create Zoom cancel outbox events
    try {
      for (const sess of sessions) {
        if (sess.providerMeetingId) {
          await this.prisma.outboxEvent.create({
            data: {
              type: 'sync-meeting',
              action: 'CANCEL',
              payload: { providerMeetingId: sess.providerMeetingId },
            },
          }).catch(() => {});
        }
      }
    } catch (cleanupErr) {
      this.logger.error(`Failed to create Zoom cancel outbox events for batch ${id}:`, cleanupErr);
    }

    await this.cacheHelper.invalidateNamespace('batches');
    return { id, deleted: true };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // HELPER: CAPACITY & RESPONSE FORMATTING
  // ─────────────────────────────────────────────────────────────────────────────

  private formatBatchResponse(batch: any) {
    const enrolledCount =
      batch._count?.enrolments ??
      (Array.isArray(batch.enrolments) ? batch.enrolments.length : 0);
    const capacity = batch.capacity ?? 0;
    const remainingCapacity = Math.max(0, capacity - enrolledCount);
    const isFull = enrolledCount >= capacity;

    const now = new Date();
    const todayStartMs = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const nowMs = now.getTime();
    let computedStatus = batch.status;
    if (batch.status === BatchStatus.UPCOMING && batch.startDate) {
      const bStart = new Date(batch.startDate);
      const bStartDayMs = new Date(bStart.getFullYear(), bStart.getMonth(), bStart.getDate()).getTime();
      if (bStart.getTime() <= nowMs || bStartDayMs <= todayStartMs) {
        computedStatus =
          batch.endDate && new Date(batch.endDate).getTime() < nowMs
            ? BatchStatus.COMPLETED
            : BatchStatus.ACTIVE;
      }
    } else if (batch.status === BatchStatus.ACTIVE && batch.endDate) {
      if (new Date(batch.endDate).getTime() < nowMs) {
        computedStatus = BatchStatus.COMPLETED;
      }
    }

    return {
      id: batch.id,
      name: batch.name,
      programId: batch.programId,
      program: batch.program,
      managerId: batch.managerId,
      manager: batch.manager,
      startDate: batch.startDate,
      endDate: batch.endDate,
      capacity,
      status: computedStatus,
      price: (batch as any).price ?? null,
      currency: (batch as any).currency ?? null,
      priceUSD: (batch as any).priceUSD ?? null,
      priceAED: (batch as any).priceAED ?? null,
      priceINR: (batch as any).priceINR ?? null,
      enrolledCount,
      remainingCapacity,
      isFull,
      trainers: Array.isArray(batch.trainers)
        ? batch.trainers.map((t: any) => t.trainer ?? t)
        : [],
      enrolments: batch.enrolments,
      createdAt: batch.createdAt,
      updatedAt: batch.updatedAt,
    };
  }
}
