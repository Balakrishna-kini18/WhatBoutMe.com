import { Injectable, NotFoundException } from '@nestjs/common';
import { forgetSessions } from '../../common/session-cache.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CacheHelperService } from '../../common/cache/cache-helper.service.js';
import { Role } from '@prisma/client';

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private cacheHelper: CacheHelperService
  ) {}

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        enrolments: {
          include: {
            batch: {
              include: {
                program: true,
              },
            },
          },
        },
      },
    });
    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }
    const { passwordHash, ...safeUser } = user;
    return safeUser;
  }

  async findAll(params: { page: number; limit: number; search?: string; role?: Role }) {
    const { page, limit, search, role } = params;
    
    // Hash parameters to create a unique cache key for this exact list request
    const paramsHash = Buffer.from(JSON.stringify({ page, limit, search, role })).toString('base64');
    const cacheKey = await this.cacheHelper.getVersionedKey('users', `list:${paramsHash}`);

    return this.cacheHelper.getOrSet(cacheKey, async () => {
      const skip = (page - 1) * limit;

    const where: any = {};
    if (role) where.role = role;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [total, users] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          enrolments: {
            take: 1, // just one for demo as per original
            include: {
              batch: { select: { name: true, programId: true } }
            }
          }
        }
      })
    ]);

    const enrolments = users.flatMap(u => u.enrolments);
    const enrolmentIds = enrolments.map(e => e.id);
    const programIds = [...new Set(enrolments.map(e => e.batch?.programId).filter(Boolean))];

    // 1. Total items (published lessons + quizzes) per program
    const programTotals: Record<string, number> = {};
    if (programIds.length > 0) {
      const steps = await this.prisma.step.findMany({
        where: {
          programId: { in: programIds as string[] },
          status: 'PUBLISHED',
        },
        select: {
          programId: true,
          lessons: {
            where: { status: 'PUBLISHED' },
            select: { id: true },
          },
          quiz: { select: { id: true } },
        },
      });
      for (const step of steps) {
        programTotals[step.programId] =
          (programTotals[step.programId] || 0) +
          step.lessons.length +
          (step.quiz ? 1 : 0);
      }
    }

    // 2. Completed items per enrolment (lessons viewed + distinct quizzes passed)
    const enrolmentCompletions: Record<string, number> = {};
    if (enrolmentIds.length > 0) {
      const [lessonProgress, passedAttempts] = await Promise.all([
        this.prisma.userLessonProgress.groupBy({
          by: ['enrolmentId'],
          where: { enrolmentId: { in: enrolmentIds }, viewed: true },
          _count: { lessonId: true },
        }),
        this.prisma.attempt.findMany({
          where: { enrolmentId: { in: enrolmentIds }, status: 'PASSED' },
          select: { enrolmentId: true, quizId: true },
        }),
      ]);

      for (const lp of lessonProgress) {
        enrolmentCompletions[lp.enrolmentId] =
          (enrolmentCompletions[lp.enrolmentId] || 0) + lp._count.lessonId;
      }

      const passedQuizSetByEnrolment: Record<string, Set<string>> = {};
      for (const a of passedAttempts) {
        if (!passedQuizSetByEnrolment[a.enrolmentId]) {
          passedQuizSetByEnrolment[a.enrolmentId] = new Set();
        }
        passedQuizSetByEnrolment[a.enrolmentId].add(a.quizId);
      }

      for (const [enrolId, set] of Object.entries(passedQuizSetByEnrolment)) {
        enrolmentCompletions[enrolId] =
          (enrolmentCompletions[enrolId] || 0) + set.size;
      }
    }

    const data = users.map(user => {
      const enrolment = user.enrolments[0];
      let progressPct = 0;

      if (enrolment && enrolment.batch?.programId) {
        const totalItems = programTotals[enrolment.batch.programId] || 0;
        const completedItems = Math.min(
          totalItems,
          enrolmentCompletions[enrolment.id] || 0,
        );
        if (totalItems > 0) {
          progressPct =
            completedItems === totalItems
              ? 100
              : Math.floor((completedItems / totalItems) * 100);
          if (progressPct > 100) progressPct = 100;
        }
      }

      return {
        id: user.id,
        name: user.name || 'Unknown',
        email: user.email,
        role: user.role,
        status: enrolment?.status || 'Active',
        progress: `${progressPct}%`,
        cohort: enrolment?.batch?.name || 'Unassigned',
        joined: new Date(user.createdAt).toLocaleDateString(),
      };
    });

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
    });
  }

  async create(data: any) {
    const bcrypt = await import('bcryptjs');
    // The request is validated with a plain `password` field; older callers
    // sent the plain text as `passwordHash`. Either way it is hashed here.
    const { password, passwordHash, ...userData } = data;
    const plain = password ?? passwordHash;
    if (plain) {
      userData.passwordHash = await bcrypt.hash(plain, 12);
    }
    return this.prisma.user.create({ data: userData });
  }

  async update(id: string, data: any) {
    const { passwordHash: _ph, status: _st, cohort: _co, progress: _pr, joined: _jo, ...userData } = data;
    const bcrypt = await import('bcryptjs');
    if (data.password) {
      userData.passwordHash = await bcrypt.hash(data.password, 12);
    }
    
    // Determine if we need to revoke sessions
    let shouldRevoke = false;
    let revokeReason = '';
    
    const currentUser = await this.prisma.user.findUnique({ where: { id }});
    if (currentUser) {
      if (data.role && data.role !== currentUser.role) {
        shouldRevoke = true;
        revokeReason = 'ROLE_CHANGED';
      }
      if (data.password) {
        shouldRevoke = true;
        revokeReason = 'PASSWORD_CHANGED';
      }
      // Assuming 'status' means suspension if implemented
      if (data.status === 'SUSPENDED') {
        shouldRevoke = true;
        revokeReason = 'SUSPENDED';
      }
    }

    if (shouldRevoke) {
      await this.prisma.userSession.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date(), revokedReason: revokeReason }
      });
      forgetSessions();
    }

    const updatedUser = await this.prisma.user.update({
      where: { id },
      data: userData,
    });
    
    await this.cacheHelper.invalidateNamespace(`auth_user:${id}`);
    await this.cacheHelper.invalidateNamespace('users');
    return updatedUser;
  }

  async remove(id: string) {
    await this.prisma.userSession.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: 'USER_DELETED' }
    });
    forgetSessions();
    await this.cacheHelper.invalidateNamespace(`auth_user:${id}`);
    await this.cacheHelper.invalidateNamespace('users');
    return this.prisma.user.delete({
      where: { id },
    });
  }

  async getUserSessions(userId: string) {
    return this.prisma.userSession.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' }
    });
  }

  async revokeUserSessions(userId: string) {
    const res = await this.prisma.userSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: 'ADMIN_REVOKED' }
    });
    forgetSessions();
    await this.cacheHelper.invalidateNamespace(`auth_user:${userId}`);

    await this.prisma.logAction({
      action: 'SESSIONS_REVOKED',
      entity: 'User',
      entityId: userId,
      meta: { count: res.count }
    });

    return res;
  }
}
