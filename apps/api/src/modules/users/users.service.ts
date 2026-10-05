import { Injectable } from '@nestjs/common';
import { forgetSessions } from '../../common/session-cache.js';
import { PrismaService } from '../../prisma/prisma.service.js';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    const users = await this.prisma.user.findMany({
      include: {
        enrolments: {
          include: {
            batch: {
              include: { 
                program: {
                  include: {
                    steps: {
                      include: {
                        lessons: true,
                        quiz: true,
                      }
                    }
                  }
                }
              },
            },
            lessonProgress: true,
            attempts: true,
          }
        }
      }
    });

    return users.map(user => {
      const enrolment = user.enrolments[0]; // Just take first for demo

      let progressPct = 0;
      if (enrolment) {
        let totalItems = 0;
        let completedItems = 0;

        const steps = enrolment.batch?.program?.steps || [];
        for (const step of steps) {
          // Count lessons
          for (const lesson of step.lessons || []) {
            totalItems++;
            const lp = enrolment.lessonProgress?.find(p => p.lessonId === lesson.id);
            if (lp?.viewed) completedItems++;
          }
          // Count quiz
          if (step.quiz) {
            totalItems++;
            const attempt = enrolment.attempts?.find(a => a.quizId === step.quiz?.id && a.status === 'PASSED');
            if (attempt) completedItems++;
          }
        }

        if (totalItems > 0) {
          progressPct = Math.round((completedItems / totalItems) * 100);
        }
      }

      return {
        id: user.id,
        name: user.name || 'Unknown',
        email: user.email,
        role: user.role,
        status: enrolment?.status || 'Active',
        progress: `${progressPct}%`, // Real progress calculated
        cohort: enrolment?.batch?.name || 'Unassigned',
        joined: new Date(user.createdAt).toLocaleDateString(),
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

    return this.prisma.user.update({
      where: { id },
      data: userData,
    });
  }

  async remove(id: string) {
    await this.prisma.userSession.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: 'USER_DELETED' }
    });
    forgetSessions();
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

    await this.prisma.logAction({
      action: 'SESSIONS_REVOKED',
      entity: 'User',
      entityId: userId,
      meta: { count: res.count }
    });

    return res;
  }
}
