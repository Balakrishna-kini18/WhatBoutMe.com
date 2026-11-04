import { Injectable, NotFoundException, ConflictException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { forgetSessions } from '../../common/session-cache.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CacheHelperService } from '../../common/cache/cache-helper.service.js';
import { Role, BatchStatus, EnrolmentStatus } from '@prisma/client';
import { isValidIanaTimezone } from '../../common/timezone/timezone.util.js';

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private cacheHelper: CacheHelperService
  ) {}

  async findOne(id: string, reqUser?: any) {
    if (reqUser && reqUser.role === Role.USER) {
      const myId = reqUser.sub || reqUser.id;
      if (id !== myId) {
        throw new ForbiddenException('Access denied: You can only view your own user profile');
      }
    }

    const isManager = reqUser && (reqUser.role === Role.MANAGER || reqUser.role === 'MANAGER' || reqUser.role === 'TEACHER');
    const myId = reqUser?.sub || reqUser?.id;
    const shouldCheckManagerScoping = isManager && id !== myId;

    const [user, cohortLearner] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id },
        include: {
          managedBatches: {
            include: {
              program: true,
            },
            orderBy: { createdAt: 'desc' },
          },
          enrolments: {
            orderBy: { updatedAt: 'desc' },
            include: {
              program: true,
              batch: {
                include: {
                  program: true,
                  trainers: true,
                },
              },
              signedAgreement: {
                select: {
                  id: true,
                  templateId: true,
                  status: true,
                  templateVersion: true,
                  signedAt: true,
                  typedName: true,
                },
              },
            },
          },
        },
      }),
      shouldCheckManagerScoping && typeof this.prisma.enrolment?.findFirst === 'function'
        ? this.prisma.enrolment.findFirst({
            where: {
              userId: id,
              status: { not: EnrolmentStatus.REVOKED },
              batch: {
                OR: [
                  { managerId: myId },
                  { trainers: { some: { trainerId: myId } } },
                ],
              },
            },
          })
        : Promise.resolve(null),
    ]);

    if (shouldCheckManagerScoping) {
      const isAssigned = cohortLearner || user?.enrolments?.some(
        (e: any) =>
          e.batch &&
          (e.batch.managerId === myId ||
            e.batch.trainers?.some((t: any) => t.trainerId === myId)),
      );
      if (!isAssigned) {
        throw new ForbiddenException('Access denied: Managers can only view learners enrolled in their assigned cohorts');
      }
    }


    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    const { passwordHash, ...safeUser } = user;
    const isSuspended = user.permissions?.includes('ACCOUNT_SUSPENDED');
    const isInactive = user.deletedAt !== null;
    const accountStatus = isInactive ? 'INACTIVE' : isSuspended ? 'SUSPENDED' : 'ACTIVE';

    return {
      ...safeUser,
      status: accountStatus,
      accountStatus,
    };
  }

  async findAll(params: { page: number; limit: number; search?: string; role?: Role; reqUser?: any }) {
    const { page, limit, search, role, reqUser } = params;
    
    // Hash parameters to create a unique cache key for this exact list request
    const paramsHash = Buffer.from(JSON.stringify({ page, limit, search, role })).toString('base64');
    const cacheKey = await this.cacheHelper.getVersionedKey('users', `list:${paramsHash}`);

    return this.cacheHelper.getOrSet(cacheKey, async () => {
      const skip = (page - 1) * limit;

    const where: any = {};
    if (role === 'STAFF' as any) {
      where.role = { not: Role.USER };
    } else if (role) {
      where.role = role;
    }
    
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (reqUser && ((reqUser.role === Role.MANAGER || reqUser.role === 'MANAGER' || reqUser.role === 'TEACHER') || reqUser.role === 'TEACHER')) {
      const userId = reqUser.sub || reqUser.id;
      where.enrolments = {
        some: {
          status: { not: EnrolmentStatus.REVOKED },
          batch: {
            OR: [
              { managerId: userId },
              { trainers: { some: { trainerId: userId } } },
            ],
          },
        },
      };
    }

    const roleWhere: any = {};
    if (reqUser && ((reqUser.role === Role.MANAGER || reqUser.role === 'MANAGER' || reqUser.role === 'TEACHER'))) {
      const userId = reqUser.sub || reqUser.id;
      roleWhere.enrolments = {
        some: {
          status: { not: EnrolmentStatus.REVOKED },
          batch: {
            OR: [
              { managerId: userId },
              { trainers: { some: { trainerId: userId } } },
            ],
          },
        },
      };
    }

    const [total, users, roleGroups] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          permissions: true,
          twoFactorEnabled: true,
          createdAt: true,
          deletedAt: true,
          signedAgreements: {
            select: { id: true, status: true, signedAt: true },
            take: 1,
            orderBy: { createdAt: 'desc' },
          },
          managedBatches: {
            select: { id: true, name: true },
          },
          enrolments: {
            orderBy: { updatedAt: 'desc' },
            select: {
              id: true,
              batchId: true,
              programId: true,
              status: true,
              createdAt: true,
              batch: { select: { id: true, name: true, programId: true } },
              program: { select: { id: true, title: true } },
              currentStage: true,
              missionStatementApprovedAt: true,
              signedAgreement: { select: { id: true, status: true, signedAt: true } },
              certificate: { select: { id: true, status: true, certificateCode: true } },
              stepProgress: {
                select: {
                  stepId: true,
                  isUnlocked: true,
                  isCompleted: true,
                  step: { select: { sequence: true, title: true } },
                },
              },
            },
          },
        },
      }),
      this.prisma.user.groupBy({
        by: ['role'],
        where: roleWhere,
        _count: { id: true },
      }),
    ]);

    const enrolments = users.flatMap(u => u.enrolments);
    const enrolmentIds = enrolments.map(e => e.id);
    const programIds = [...new Set(enrolments.map(e => e.programId || e.batch?.programId).filter(Boolean))];

    // 1. Total items (published lessons + quizzes) & total steps per program
    const programTotals: Record<string, number> = {};
    const programTotalSteps: Record<string, number> = {};
    if (programIds.length > 0) {
      const steps = await this.prisma.step.findMany({
        where: {
          programId: { in: programIds as string[] },
          status: 'PUBLISHED',
        },
        select: {
          programId: true,
          sequence: true,
          lessons: {
            where: { status: 'PUBLISHED' },
            select: { id: true },
          },
          quiz: { select: { id: true } },
        },
      });
      for (const step of steps) {
        programTotalSteps[step.programId] = (programTotalSteps[step.programId] || 0) + 1;
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
      const primaryEnrolment = user.enrolments.find(e => e.status === EnrolmentStatus.ACTIVE) || user.enrolments[0];
      let progressPct = 0;

      const isLearner = user.role === Role.USER;
      const isAgreementSigned = user.signedAgreements?.some((a: any) => a.status === 'SIGNED') || false;
      const effectiveProgramId = primaryEnrolment ? (primaryEnrolment.programId || primaryEnrolment.batch?.programId) : null;
      const totalSteps = effectiveProgramId ? (programTotalSteps[effectiveProgramId] || 11) : 11;

      if (primaryEnrolment && effectiveProgramId) {
        const totalItems = programTotals[effectiveProgramId] || 0;
        const completedItems = Math.min(
          totalItems,
          enrolmentCompletions[primaryEnrolment.id] || 0,
        );
        if (totalItems > 0) {
          progressPct =
            completedItems === totalItems
              ? 100
              : Math.floor((completedItems / totalItems) * 100);
          if (progressPct > 100) progressPct = 100;
        }
      }

      // Authoritative Unlocked Step Calculation (matching Learner Portal & ProgressionService)
      let currentStepNumber: number | null = null;
      let isStepLocked = false;
      let stepLockReason: string | null = null;

      if (isLearner && primaryEnrolment) {
        if (primaryEnrolment.status === EnrolmentStatus.PENDING_PAYMENT) {
          currentStepNumber = null;
          isStepLocked = true;
          stepLockReason = 'PAYMENT_REQUIRED';
        } else if (!isAgreementSigned) {
          // Digital workshop agreement gate (D1-041): Step 1 locked until signed
          currentStepNumber = null;
          isStepLocked = true;
          stepLockReason = 'AGREEMENT_REQUIRED';
        } else {
          // Agreement signed & active: inspect actual stepProgress
          const stepProgs = (primaryEnrolment as any).stepProgress || [];
          const unlocked = stepProgs.filter((sp: any) => sp.isUnlocked);
          const incompleteUnlocked = unlocked.filter((sp: any) => !sp.isCompleted);

          if (incompleteUnlocked.length > 0) {
            currentStepNumber = Math.min(...incompleteUnlocked.map((sp: any) => sp.step?.sequence || 1));
          } else if (unlocked.length > 0) {
            currentStepNumber = Math.max(...unlocked.map((sp: any) => sp.step?.sequence || 1));
          } else {
            currentStepNumber = 1;
          }
          isStepLocked = false;
        }
      }

      // Pure Curriculum Progression Computation (Option A: Completed/Total Steps (%))
      const rawCurrentStage = (primaryEnrolment as any)?.currentStage || 'STAGE_1_CURRICULUM';
      const certStatus = (primaryEnrolment as any)?.certificate?.status;
      const primaryStepProgs = (primaryEnrolment as any)?.stepProgress || [];
      const primaryCompletedSteps = primaryStepProgs.filter((sp: any) => sp.isCompleted).length;
      const primaryProgressPercent = totalSteps > 0 ? Math.round((primaryCompletedSteps / totalSteps) * 100) : 0;
      let stageLabel: string | null = null;

      if (isLearner && primaryEnrolment) {
        if (isStepLocked) {
          stageLabel = stepLockReason === 'PAYMENT_REQUIRED'
            ? 'Payment Pending'
            : stepLockReason === 'AGREEMENT_REQUIRED'
            ? 'Agreement Required'
            : 'Locked';
        } else if (certStatus === 'ISSUED') {
          stageLabel = 'Certified';
        } else {
          stageLabel = `${primaryCompletedSteps}/${totalSteps} Steps (${primaryProgressPercent}%)`;
        }
      }

      // Pure Account Status Calculation (Active / Suspended / Inactive)
      const isSuspended = user.permissions?.includes('ACCOUNT_SUSPENDED');
      const isInactive = (user as any).deletedAt !== null;
      const accountStatus = isInactive ? 'INACTIVE' : isSuspended ? 'SUSPENDED' : 'ACTIVE';

      return {
        id: user.id,
        name: user.name || 'Unknown',
        email: user.email,
        role: user.role,
        permissions: user.permissions || [],
        status: accountStatus,
        accountStatus,
        enrolmentStatus: primaryEnrolment?.status || (isLearner ? 'Unenrolled' : 'Active'),
        progress: `${primaryProgressPercent}%`,
        currentStepNumber,
        completedSteps: primaryCompletedSteps,
        totalSteps: isLearner && primaryEnrolment ? totalSteps : null,
        progressPercent: primaryProgressPercent,
        currentStage: isLearner ? rawCurrentStage : null,
        stageLabel: isLearner ? stageLabel : null,
        isStepLocked,
        stepLockReason,
        twoFactorEnabled: Boolean(user.twoFactorEnabled),
        isAgreementSigned,
        managedBatches: user.managedBatches || [],
        cohort: primaryEnrolment?.batch?.name || (isLearner ? 'Unassigned' : null),
        batchId: primaryEnrolment?.batchId || null,
        enrolmentId: primaryEnrolment?.id || null,
        programId: primaryEnrolment?.programId || null,
        enrolments: user.enrolments.map(e => {
          const eProgramId = e.programId || e.batch?.programId;
          const eTotalSteps = eProgramId ? (programTotalSteps[eProgramId] || 11) : 11;
          const eStepProgs = (e as any).stepProgress || [];
          const eUnlocked = eStepProgs.filter((sp: any) => sp.isUnlocked);
          const eIncompleteUnlocked = eUnlocked.filter((sp: any) => !sp.isCompleted);
          const eCompletedCount = eStepProgs.filter((sp: any) => sp.isCompleted).length;
          const eProgressPct = eTotalSteps > 0 ? Math.round((eCompletedCount / eTotalSteps) * 100) : 0;

          const isEnrAgreementSigned = (e as any).signedAgreement?.status === 'SIGNED' || isAgreementSigned;

          let eStepNum: number | null = null;
          let eLocked = false;
          let eLockReason: string | null = null;
          let eLabel = '';

          if (e.status === EnrolmentStatus.PENDING_PAYMENT) {
            eStepNum = null;
            eLocked = true;
            eLockReason = 'PAYMENT_REQUIRED';
            eLabel = 'Payment Pending';
          } else if (!isEnrAgreementSigned) {
            eStepNum = null;
            eLocked = true;
            eLockReason = 'AGREEMENT_REQUIRED';
            eLabel = 'Agreement Required';
          } else {
            if (eIncompleteUnlocked.length > 0) {
              eStepNum = Math.min(...eIncompleteUnlocked.map((sp: any) => sp.step?.sequence || 1));
            } else if (eUnlocked.length > 0) {
              eStepNum = Math.max(...eUnlocked.map((sp: any) => sp.step?.sequence || 1));
            } else {
              eStepNum = 1;
            }

            const eCertStatus = (e as any)?.certificate?.status;
            if (eCertStatus === 'ISSUED') {
              eLabel = 'Certified';
            } else {
              eLabel = `${eCompletedCount}/${eTotalSteps} Steps (${eProgressPct}%)`;
            }
          }

          return {
            id: e.id,
            batchId: e.batchId,
            batchName: e.batch?.name || 'Unassigned',
            programId: e.programId,
            programTitle: e.program?.title || 'Unknown',
            status: e.status,
            currentStepNumber: eStepNum,
            completedSteps: eCompletedCount,
            totalSteps: eTotalSteps,
            progressPercent: eProgressPct,
            isStepLocked: eLocked,
            stepLockReason: eLockReason,
            stepLabel: eLabel,
            isAgreementSigned: isEnrAgreementSigned,
            createdAt: e.createdAt,
          };
        }),
        enrolledAt: primaryEnrolment?.createdAt || null,
        createdAt: user.createdAt,
        joined: (() => {
          const d = new Date(user.createdAt);
          if (isNaN(d.getTime())) return '—';
          const dd = String(d.getDate()).padStart(2, '0');
          const mm = String(d.getMonth() + 1).padStart(2, '0');
          const yyyy = d.getFullYear();
          return `${dd}/${mm}/${yyyy}`;
        })(),
      };
    });

    const roleCounts: Record<string, number> = { ALL: 0, USER: 0, MANAGER: 0, ADMIN: 0, SUPER_ADMIN: 0 };
    for (const rg of roleGroups) {
      const r = rg.role === ('TEACHER' as any) ? 'MANAGER' : rg.role;
      roleCounts[r] = (roleCounts[r] || 0) + rg._count.id;
      roleCounts.ALL += rg._count.id;
    }

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      roleCounts,
    };
    });
  }

  async create(data: any, reqUser?: any) {
    if (data.role && data.role !== Role.USER) {
      if (reqUser && reqUser.role !== Role.SUPER_ADMIN && reqUser.role !== 'SUPER_ADMIN') {
        throw new ForbiddenException('Access denied: Only Super Admin can assign staff roles');
      }
    }

    if (data.timezone && !isValidIanaTimezone(data.timezone)) {
      throw new BadRequestException(`Invalid IANA timezone: ${data.timezone}`);
    }

    const bcrypt = await import('bcryptjs');
    const targetBatchId = data.batchId || data.cohort;
    const { password, passwordHash, status: _st, batchId: _bid, batchIds: _bids, cohort: _coh, ...userData } = data;
    const plain = password ?? passwordHash;
    if (plain) {
      userData.passwordHash = await bcrypt.hash(plain, 12);
    }
    try {
      const created = await this.prisma.user.create({ data: userData });
      if (data.role && data.role !== Role.USER) {
        await this.prisma.logAction({
          actorId: reqUser?.sub || reqUser?.id,
          action: 'STAFF_USER_CREATED',
          entity: 'User',
          entityId: created.id,
          meta: { role: created.role, createdBy: reqUser?.sub || reqUser?.id }
        });
      }

      // If a cohort is provided during creation:
      if (targetBatchId) {
        if (created.role === Role.USER) {
          const batch = await this.prisma.batch.findUnique({
            where: { id: targetBatchId },
            include: { program: true },
          });
          if (!batch) {
            throw new NotFoundException(`Batch '${targetBatchId}' not found`);
          }
          if (batch.status === BatchStatus.COMPLETED || batch.status === BatchStatus.ARCHIVED) {
            throw new BadRequestException(`Cannot enroll into a ${batch.status} batch`);
          }
          const occupiedCount = await this.prisma.enrolment.count({
            where: {
              batchId: batch.id,
              status: { in: [EnrolmentStatus.ACTIVE, EnrolmentStatus.PENDING_AGREEMENT, EnrolmentStatus.COMPLETED] },
            },
          });
          const isFull = occupiedCount >= batch.capacity;

          await this.prisma.enrolment.create({
            data: {
              userId: created.id,
              programId: batch.programId,
              batchId: batch.id,
              status: isFull ? EnrolmentStatus.WAITLIST : EnrolmentStatus.ACTIVE,
            },
          });
        } else if ((created.role as any) === 'MANAGER' || (created.role as any) === Role.TEACHER) {
          await this.prisma.batch.update({
            where: { id: targetBatchId },
            data: { managerId: created.id },
          }).catch(() => null);
        }
      }

      // Handle multi-batch assignment for Managers during creation
      if (data.batchIds && Array.isArray(data.batchIds) && data.batchIds.length > 0) {
        await this.prisma.batch.updateMany({
          where: { id: { in: data.batchIds } },
          data: { managerId: created.id },
        }).catch(() => null);
      }

      await this.cacheHelper.invalidateNamespace('users');
      await this.cacheHelper.invalidateNamespace('enrolments');
      await this.cacheHelper.invalidateNamespace('batches');
      return created;
    } catch (error: any) {
      if (error.code === 'P2002' && error.meta?.target?.includes('email')) {
        throw new ConflictException('A user with this email already exists.');
      }
      throw error;
    }
  }

  async update(id: string, data: any, reqUser?: any) {
    // If Learner: can only modify their own profile - check before DB lookup to prevent ID enumeration
    if (reqUser && reqUser.role === Role.USER) {
      const myId = reqUser.sub || reqUser.id;
      if (id !== myId) {
        throw new ForbiddenException('Access denied: You can only modify your own profile');
      }
      delete data.role;
      delete data.permissions;
    }

    // Manager restrictions: Managers cannot modify other user accounts
    if (reqUser && (reqUser.role === Role.MANAGER || reqUser.role === 'MANAGER' || reqUser.role === 'TEACHER')) {
      const myId = reqUser.sub || reqUser.id;
      if (id !== myId) {
        throw new ForbiddenException('Access denied: Managers cannot modify other user accounts');
      }
    }

    const currentUser = await this.prisma.user.findUnique({ where: { id }});
    if (!currentUser) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    // Permissions modification rule: ONLY Super Admin can grant or alter user permissions
    if (data.permissions !== undefined) {
      if (!reqUser || (reqUser.role !== Role.SUPER_ADMIN && reqUser.role !== 'SUPER_ADMIN')) {
        delete data.permissions;
      }
    }

    // Role modification rule: ONLY Super Admin can change a user's role (PDF Page 3-4)
    if (data.role && data.role !== currentUser.role) {
      if (!reqUser || (reqUser.role !== Role.SUPER_ADMIN && reqUser.role !== 'SUPER_ADMIN')) {
        throw new ForbiddenException('Access denied: Only Super Admin can change user roles');
      }
    }

    // Only Super Admin can modify Super Admin accounts
    if (currentUser.role === Role.SUPER_ADMIN) {
      if (reqUser && reqUser.role !== Role.SUPER_ADMIN && reqUser.role !== 'SUPER_ADMIN') {
        throw new ForbiddenException('Access denied: Only Super Admin can modify Super Admin accounts');
      }
    }

    const targetBatchId = data.batchId || data.cohort;
    const targetEnrolmentId = data.enrolmentId;
    if (data.timezone && !isValidIanaTimezone(data.timezone)) {
      throw new BadRequestException(`Invalid IANA timezone: ${data.timezone}`);
    }

    const { passwordHash: _ph, status: _st, cohort: _co, batchId: _bid, batchIds: _bids, enrolmentId: _eid, progress: _pr, joined: _jo, ...userData } = data;
    const bcrypt = await import('bcryptjs');
    if (data.password) {
      userData.passwordHash = await bcrypt.hash(data.password, 12);
    }
    
    // Determine if we need to revoke sessions and handle Account Status transitions
    let shouldRevoke = false;
    let revokeReason = '';

    let nextPermissions: string[] = Array.isArray(userData.permissions)
      ? [...userData.permissions]
      : Array.isArray(currentUser.permissions)
      ? [...currentUser.permissions]
      : [];

    if (data.status === 'SUSPENDED') {
      shouldRevoke = true;
      revokeReason = 'SUSPENDED';
      if (!nextPermissions.includes('ACCOUNT_SUSPENDED')) {
        nextPermissions.push('ACCOUNT_SUSPENDED');
      }
      userData.permissions = nextPermissions;
      userData.deletedAt = null;
    } else if (data.status === 'INACTIVE') {
      shouldRevoke = true;
      revokeReason = 'ACCOUNT_DISABLED';
      nextPermissions = nextPermissions.filter((p: string) => p !== 'ACCOUNT_SUSPENDED');
      userData.permissions = nextPermissions;
      userData.deletedAt = new Date();
    } else if (data.status === 'ACTIVE') {
      nextPermissions = nextPermissions.filter((p: string) => p !== 'ACCOUNT_SUSPENDED');
      userData.permissions = nextPermissions;
      userData.deletedAt = null;
    }
    
    if (data.role && data.role !== currentUser.role) {
      shouldRevoke = true;
      revokeReason = 'ROLE_CHANGED';
    }
    if (data.password) {
      shouldRevoke = true;
      revokeReason = 'PASSWORD_CHANGED';
    }

    if (shouldRevoke) {
      await this.prisma.userSession.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date(), revokedReason: revokeReason }
      });
      forgetSessions();
      await this.cacheHelper.invalidateNamespace(`auth_user:${id}`);
    }

    try {
      const updatedUser = await this.prisma.user.update({
        where: { id },
        data: userData,
      });

      if (data.role && data.role !== currentUser.role) {
        await this.prisma.logAction({
          actorId: reqUser?.sub || reqUser?.id,
          action: 'USER_ROLE_CHANGED',
          entity: 'User',
          entityId: id,
          meta: { oldRole: currentUser.role, newRole: data.role, changedBy: reqUser?.sub || reqUser?.id }
        });
      }

      if (data.status) {
        await this.prisma.logAction({
          actorId: reqUser?.sub || reqUser?.id,
          action: 'USER_STATUS_CHANGED',
          entity: 'User',
          entityId: id,
          meta: { status: data.status, changedBy: reqUser?.sub || reqUser?.id }
        });
      }

      // Persist Cohort / Batch Assignment for Learner or Manager
      if (targetBatchId) {
        if (currentUser.role === Role.USER) {
          const batch = await this.prisma.batch.findUnique({
            where: { id: targetBatchId },
            include: { program: true },
          });
          if (!batch) {
            throw new NotFoundException(`Batch '${targetBatchId}' not found`);
          }
          if (batch.status === BatchStatus.COMPLETED || batch.status === BatchStatus.ARCHIVED) {
            throw new BadRequestException(`Cannot assign learner to a ${batch.status} batch`);
          }

          const occupiedCount = await this.prisma.enrolment.count({
            where: {
              batchId: targetBatchId,
              status: { in: [EnrolmentStatus.ACTIVE, EnrolmentStatus.PENDING_AGREEMENT, EnrolmentStatus.COMPLETED] },
            },
          });
          const isFull = occupiedCount >= batch.capacity;

          if (targetEnrolmentId && targetEnrolmentId !== 'NEW') {
            const enrolmentToUpdate = await this.prisma.enrolment.findUnique({
              where: { id: targetEnrolmentId },
            });
            if (!enrolmentToUpdate || enrolmentToUpdate.userId !== id) {
              throw new NotFoundException(`Enrolment '${targetEnrolmentId}' not found for user`);
            }

            // Check if the learner already has a separate enrolment in the target batch's program
            const existingInTargetProgram = await this.prisma.enrolment.findUnique({
              where: { userId_programId: { userId: id, programId: batch.programId } },
            });

            const recordToUpdate =
              existingInTargetProgram && existingInTargetProgram.id !== enrolmentToUpdate.id
                ? existingInTargetProgram
                : enrolmentToUpdate;

            const occupiedForTarget = await this.prisma.enrolment.count({
              where: {
                batchId: targetBatchId,
                id: { not: recordToUpdate.id },
                status: { in: [EnrolmentStatus.ACTIVE, EnrolmentStatus.PENDING_AGREEMENT, EnrolmentStatus.COMPLETED] },
              },
            });
            const isTargetFull = occupiedForTarget >= batch.capacity;

            if (recordToUpdate.batchId !== targetBatchId || recordToUpdate.status === EnrolmentStatus.WAITLIST) {
              await this.prisma.enrolment.update({
                where: { id: recordToUpdate.id },
                data: {
                  batchId: targetBatchId,
                  programId: batch.programId,
                  status: isTargetFull
                    ? EnrolmentStatus.WAITLIST
                    : recordToUpdate.status === EnrolmentStatus.REVOKED || recordToUpdate.status === EnrolmentStatus.WAITLIST
                    ? EnrolmentStatus.ACTIVE
                    : recordToUpdate.status,
                },
              });
              await this.prisma.logAction({
                actorId: reqUser?.sub || reqUser?.id,
                action: 'BATCH_TRANSFERRED',
                entity: 'Enrolment',
                entityId: recordToUpdate.id,
                meta: { userId: id, fromBatchId: recordToUpdate.batchId, toBatchId: targetBatchId, changedBy: reqUser?.sub || reqUser?.id }
              });
            }
          } else {
            const existingProgEnrolment = await this.prisma.enrolment.findUnique({
              where: { userId_programId: { userId: id, programId: batch.programId } },
            });

            if (existingProgEnrolment) {
              const occupiedForTarget = await this.prisma.enrolment.count({
                where: {
                  batchId: targetBatchId,
                  id: { not: existingProgEnrolment.id },
                  status: { in: [EnrolmentStatus.ACTIVE, EnrolmentStatus.PENDING_AGREEMENT, EnrolmentStatus.COMPLETED] },
                },
              });
              const isTargetFull = occupiedForTarget >= batch.capacity;

              if (existingProgEnrolment.batchId !== targetBatchId || existingProgEnrolment.status === EnrolmentStatus.WAITLIST) {
                await this.prisma.enrolment.update({
                  where: { id: existingProgEnrolment.id },
                  data: {
                    batchId: targetBatchId,
                    status: isTargetFull
                      ? EnrolmentStatus.WAITLIST
                      : existingProgEnrolment.status === EnrolmentStatus.REVOKED || existingProgEnrolment.status === EnrolmentStatus.WAITLIST
                      ? EnrolmentStatus.ACTIVE
                      : existingProgEnrolment.status,
                  },
                });
                await this.prisma.logAction({
                  actorId: reqUser?.sub || reqUser?.id,
                  action: 'BATCH_TRANSFERRED',
                  entity: 'Enrolment',
                  entityId: existingProgEnrolment.id,
                  meta: { userId: id, fromBatchId: existingProgEnrolment.batchId, toBatchId: targetBatchId, changedBy: reqUser?.sub || reqUser?.id }
                });
              }
            } else {
              const newEnrolment = await this.prisma.enrolment.create({
                data: {
                  userId: id,
                  programId: batch.programId,
                  batchId: targetBatchId,
                  status: isFull ? EnrolmentStatus.WAITLIST : EnrolmentStatus.ACTIVE,
                },
              });
              await this.prisma.logAction({
                actorId: reqUser?.sub || reqUser?.id,
                action: 'ENROLMENT_CREATED',
                entity: 'Enrolment',
                entityId: newEnrolment.id,
                meta: { userId: id, programId: batch.programId, batchId: targetBatchId, createdBy: reqUser?.sub || reqUser?.id }
              });
            }
          }
        } else if ((currentUser.role as any) === 'MANAGER' || (currentUser.role as any) === Role.TEACHER) {
          await this.prisma.batch.update({
            where: { id: targetBatchId },
            data: { managerId: id },
          }).catch(() => null);
        }
      }

      // Handle multi-batch assignment for Managers
      if (data.batchIds && Array.isArray(data.batchIds)) {
        await this.prisma.batch.updateMany({
          where: { managerId: id, id: { notIn: data.batchIds } },
          data: { managerId: null },
        }).catch(() => null);
        if (data.batchIds.length > 0) {
          await this.prisma.batch.updateMany({
            where: { id: { in: data.batchIds } },
            data: { managerId: id },
          }).catch(() => null);
        }
      }
      
      await this.cacheHelper.invalidateNamespace(`auth_user:${id}`);
      await this.cacheHelper.invalidateNamespace('users');
      await this.cacheHelper.invalidateNamespace('enrolments');
      await this.cacheHelper.invalidateNamespace('batches');
      return updatedUser;
    } catch (error: any) {
      if (error.code === 'P2002' && error.meta?.target?.includes('email')) {
        throw new ConflictException('A user with this email already exists.');
      }
      throw error;
    }
  }

  async remove(id: string, reqUser?: any) {
    if (reqUser) {
      const myId = reqUser.sub || reqUser.id;
      if (id === myId) {
        throw new ForbiddenException('Access denied: Cannot delete your own Super Admin account');
      }
    }

    await this.prisma.userSession.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: 'USER_DELETED' }
    });
    forgetSessions();
    await this.cacheHelper.invalidateNamespace(`auth_user:${id}`);
    await this.cacheHelper.invalidateNamespace('users');

    await this.prisma.logAction({
      actorId: reqUser?.sub || reqUser?.id,
      action: 'USER_DELETED',
      entity: 'User',
      entityId: id,
      meta: { deletedBy: reqUser?.sub || reqUser?.id }
    });

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

  async revokeAccess(id: string, body?: { enrolmentId?: string; reason?: string }, reqUser?: any) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        enrolments: {
          include: {
            batch: true,
            program: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    const activeEnrolments = user.enrolments.filter(
      (e) => e.status !== EnrolmentStatus.REVOKED && e.status !== EnrolmentStatus.COMPLETED,
    );

    if (activeEnrolments.length === 0) {
      throw new BadRequestException('Learner has no active enrolments to revoke');
    }

    let targetEnrolment: (typeof user.enrolments)[0];

    if (body?.enrolmentId) {
      const found = user.enrolments.find((e) => e.id === body.enrolmentId);
      if (!found) {
        throw new NotFoundException(`Enrolment with ID ${body.enrolmentId} not found for this user`);
      }
      if (found.status === EnrolmentStatus.REVOKED) {
        throw new BadRequestException('This enrolment is already revoked');
      }
      targetEnrolment = found;
    } else {
      if (activeEnrolments.length > 1) {
        throw new BadRequestException(
          'Learner has multiple active enrolments. Please specify the enrolmentId to revoke.',
        );
      }
      targetEnrolment = activeEnrolments[0];
    }

    // Role and manager cohort-scoping checks:
    if (reqUser && (reqUser.role === Role.MANAGER || reqUser.role === 'MANAGER' || reqUser.role === 'TEACHER')) {
      const myId = reqUser.sub || reqUser.id;
      let isPermitted = false;
      if (targetEnrolment.batch) {
        if (targetEnrolment.batch.managerId === myId) {
          isPermitted = true;
        } else {
          const isTrainer = await this.prisma.batchTrainer.findFirst({
            where: { batchId: targetEnrolment.batch.id, trainerId: myId },
          });
          if (isTrainer) isPermitted = true;
        }
      }
      if (!isPermitted) {
        throw new ForbiddenException(
          'Access denied: Managers can only revoke access for learners in their assigned cohorts',
        );
      }
    }

    const reason = body?.reason || 'ADMIN_REVOKED_ACCESS';

    // Update target enrolment to REVOKED
    await this.prisma.enrolment.update({
      where: { id: targetEnrolment.id },
      data: { status: EnrolmentStatus.REVOKED },
    });

    // Narrowest safe behavior: Only terminate sessions if user has 0 active enrolments remaining
    const remainingActiveEnrolments = user.enrolments.filter(
      (e) => e.id !== targetEnrolment.id && e.status === EnrolmentStatus.ACTIVE,
    );

    let revokedSessionsCount = 0;
    if (remainingActiveEnrolments.length === 0) {
      const sessionRes = await this.prisma.userSession.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date(), revokedReason: reason },
      });
      revokedSessionsCount = sessionRes.count;
      forgetSessions();
    }

    await this.cacheHelper.invalidateNamespace(`auth_user:${id}`);
    await this.cacheHelper.invalidateNamespace('users');
    await this.cacheHelper.invalidateNamespace('enrolments');
    await this.cacheHelper.invalidateNamespace('batches');

    await this.prisma.logAction({
      actorId: reqUser?.sub || reqUser?.id,
      action: 'LEARNER_ACCESS_REVOKED',
      entity: 'Enrolment',
      entityId: targetEnrolment.id,
      meta: {
        targetUserId: id,
        targetUserEmail: user.email,
        enrolmentId: targetEnrolment.id,
        programId: targetEnrolment.programId,
        batchId: targetEnrolment.batchId,
        programTitle: targetEnrolment.program?.title,
        batchName: targetEnrolment.batch?.name,
        revokedEnrolmentsCount: 1,
        revokedSessionsCount,
        remainingActiveEnrolmentsCount: remainingActiveEnrolments.length,
        reason,
        revokedBy: reqUser?.sub || reqUser?.id,
      },
    });

    return {
      success: true,
      message: `Access revoked for course "${targetEnrolment.program?.title || 'Program'}" (${targetEnrolment.batch?.name || 'Cohort'}). ${
        remainingActiveEnrolments.length > 0
          ? `Learner has ${remainingActiveEnrolments.length} other active enrolment(s); login session preserved.`
          : `Learner has no other active enrolments; ${revokedSessionsCount} active login session(s) terminated.`
      }`,
      enrolmentId: targetEnrolment.id,
      batchId: targetEnrolment.batchId,
      programId: targetEnrolment.programId,
      remainingActiveEnrolmentsCount: remainingActiveEnrolments.length,
      revokedEnrolmentsCount: 1,
      revokedSessionsCount,
    };
  }
}
