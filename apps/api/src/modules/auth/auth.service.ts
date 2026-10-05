import { Injectable, UnauthorizedException, ConflictException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service.js';
import { Role, EnrolmentStatus } from '@prisma/client';
import { SignupDto } from './dto/index.js';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { markDailyAttendance } from '../../common/daily-attendance.js';
import { forgetSessions } from '../../common/session-cache.js';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  /**
   * Production-level login: validates email + password hash, returns JWT.
   */
  /** Mobile numbers are stored and compared as digits with an optional leading +. */
  private normalizePhone(phone: string) {
    const trimmed = phone.trim();
    return (trimmed.startsWith('+') ? '+' : '') + trimmed.replace(/\D/g, '');
  }

  /** `identifier` is the account email, or its mobile number. */
  async login(identifier: string, password: string) {
    const include = {
      enrolments: {
        include: {
          batch: {
            include: { program: true },
          },
        },
      },
    };

    let user;
    if (identifier.includes('@')) {
      user = await this.prisma.user.findUnique({ where: { email: identifier }, include });
    } else {
      // a number only signs in when exactly one account holds it
      const matches = await this.prisma.user.findMany({
        where: { phone: { in: [this.normalizePhone(identifier), identifier.trim()] } },
        include,
        take: 2,
      });
      user = matches.length === 1 ? matches[0] : null;
    }

    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const passwordValid = await bcrypt.compare(password, user.passwordHash);
    if (!passwordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // Build basic payload for refresh token (sessionId is added later for access token)
    const refreshPayload = {
      sub: user.id,
    };

    const refreshToken = this.jwtService.sign(refreshPayload, {
      secret: process.env.JWT_REFRESH_SECRET,
      expiresIn: '7d',
    });

    // Hash the refresh token and store it
    const tokenHash = await bcrypt.hash(refreshToken, 10);

    // Enforce device limits and store session
    const sessionId = await this.createDeviceSession(user.id, user.role, tokenHash);

    // Build JWT payload with user role and tenant context (enrolled programs)
    const accessPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      companyId: user.companyId,
      sessionId,
    };

    const accessToken = this.jwtService.sign(accessPayload, { expiresIn: '15m' });

    // signing in counts as attending today
    // not awaited: it must not hold up the sign-in (it never throws)
    if (user.role === Role.USER) void markDailyAttendance(this.prisma, user.id, 'visited');

    // Return user data with enrolled programs for tenant separation
    const enrolledPrograms = user.enrolments.map((e) => ({
      enrolmentId: e.id,
      batchId: e.batchId,
      batchName: e.batch.name,
      programId: e.batch.programId,
      programTitle: e.batch.program.title,
      status: e.status,
    }));

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        companyId: user.companyId,
        enrolledPrograms,
      },
    };
  }

  /**
   * Production-level signup: hashes password, creates user, enrolls in programs, returns JWT.
   */
  async signup(data: SignupDto) {
    const normalizedEmail = data.email.trim().toLowerCase();

    // Check if user already exists
    const existing = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    // A mobile number may belong to one account only, so it can be used to sign in
    const phone = data.phone?.trim() ? this.normalizePhone(data.phone) : null;
    if (phone) {
      const phoneTaken = await this.prisma.user.findFirst({
        where: { phone, deletedAt: null },
      });
      if (phoneTaken) {
        throw new ConflictException('An account with this mobile number already exists');
      }
    }

    // Hash password with bcrypt (12 rounds)
    const passwordHash = await bcrypt.hash(data.password, 12);

    let user;
    try {
      user = await this.prisma.user.create({
        data: {
          email: normalizedEmail,
          name: data.name.trim(),
          phone,
          country: data.country?.trim() || null,
          timezone: data.timezone?.trim() || null,
          passwordHash,
          role: Role.USER,
          emailVerifiedAt: null,
        },
      });
    } catch (err: any) {
      if (err?.code === 'P2002') {
        throw new ConflictException('An account with this email already exists');
      }
      throw err;
    }

    // Create verification token for D1-015
    const verificationToken = randomUUID();
    await this.prisma.emailVerificationToken.create({
      data: {
        userId: user.id,
        token: verificationToken,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours expiry
      },
    });

    // Enrol user in default batches for the selected programs with payment/agreement gating
    const enrolledPrograms = [];
    if (data.programIds && data.programIds.length > 0) {
      const uniqueProgramIds = Array.from(new Set(data.programIds));
      for (const pId of uniqueProgramIds) {
        const program = await this.prisma.program.findUnique({
          where: { id: pId },
        });
        if (!program) continue;

        const batch = await this.prisma.batch.findFirst({
          where: { programId: pId },
        });
        if (!batch) continue;

        // Canonical initial status: PENDING_PAYMENT for paid programs, PENDING_AGREEMENT for free programs
        const initialStatus: EnrolmentStatus =
          program.price > 0
            ? EnrolmentStatus.PENDING_PAYMENT
            : EnrolmentStatus.PENDING_AGREEMENT;

        const enrolment = await this.prisma.enrolment.create({
          data: {
            userId: user.id,
            batchId: batch.id,
            programId: pId,
            status: initialStatus,
          },
          include: {
            batch: {
              include: { program: true },
            },
          },
        });

        // Add to enrolled programs array to be returned in response
        enrolledPrograms.push({
          enrolmentId: enrolment.id,
          batchId: batch.id,
          batchName: batch.name,
          programId: pId,
          programTitle: enrolment.batch?.program?.title || program.title,
          status: enrolment.status,
          progress: 0,
        });
      }
    }

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        phone: user.phone,
        role: user.role,
        country: user.country,
        timezone: user.timezone,
        enrolledPrograms,
      },
    };
  }

  /**
   * Email Verification (D1-015): validates token, marks emailVerifiedAt, invalidates token.
   */
  async verifyEmail(token: string) {
    if (!token || typeof token !== 'string') {
      throw new BadRequestException('Invalid or expired verification token');
    }

    const verificationToken = await this.prisma.emailVerificationToken.findUnique({
      where: { token: token.trim() },
      include: { user: true },
    });

    if (!verificationToken) {
      throw new BadRequestException('Invalid or expired verification token');
    }

    if (verificationToken.usedAt !== null) {
      throw new BadRequestException('Invalid or expired verification token');
    }

    if (verificationToken.expiresAt < new Date()) {
      throw new BadRequestException('Invalid or expired verification token');
    }

    if (!verificationToken.user) {
      throw new BadRequestException('Invalid or expired verification token');
    }

    const now = new Date();

    await this.prisma.$transaction([
      this.prisma.emailVerificationToken.update({
        where: { id: verificationToken.id },
        data: { usedAt: now },
      }),
      this.prisma.user.update({
        where: { id: verificationToken.userId },
        data: { emailVerifiedAt: now },
      }),
    ]);

    return {
      success: true,
      message: 'Email verified successfully',
    };
  }

  /**
   * Admin login: only ADMIN / SUPER_ADMIN / MANAGER roles can log in here.
   */
  async adminLogin(email: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // Enforce role-based access: only admin roles can use admin login
    const adminRoles: string[] = [Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGER];
    if (!adminRoles.includes(user.role)) {
      throw new UnauthorizedException('Insufficient permissions for admin access');
    }

    const passwordValid = await bcrypt.compare(password, user.passwordHash);
    if (!passwordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const refreshPayload = { sub: user.id };
    const refreshToken = this.jwtService.sign(refreshPayload, {
      secret: process.env.JWT_REFRESH_SECRET,
      expiresIn: '7d',
    });
    const tokenHash = await bcrypt.hash(refreshToken, 10);

    // Enforce device limits
    const sessionId = await this.createDeviceSession(user.id, user.role, tokenHash);

    const accessPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      companyId: user.companyId,
      sessionId,
    };

    const accessToken = this.jwtService.sign(accessPayload, { expiresIn: '15m' });

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    };
  }

  /**
   * Refresh token endpoint
   */
  async refreshToken(refreshTokenStr: string) {
    try {
      const payload = this.jwtService.verify(refreshTokenStr, {
        secret: process.env.JWT_REFRESH_SECRET,
      });

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
      });

      if (!user) {
        throw new UnauthorizedException({ message: 'User not found', error: 'INVALID_CREDENTIALS' });
      }

      // Refresh tokens issued at login and signup carry no session id (the
      // session is created after the token is signed), so the first renewal
      // was always rejected and the learner was signed out. Find the session
      // by its stored token hash in that case.
      let sessionId: string | undefined = payload.sessionId;
      if (!sessionId) {
        const active = await this.prisma.userSession.findMany({
          where: { userId: user.id, revokedAt: null },
          orderBy: { createdAt: 'desc' },
        });
        for (const candidate of active) {
          if (await bcrypt.compare(refreshTokenStr, candidate.token)) {
            sessionId = candidate.id;
            break;
          }
        }
        if (!sessionId) {
          throw new UnauthorizedException({ message: 'Session has been revoked', error: 'SESSION_REVOKED' });
        }
      }

      const session = await this.checkSession(sessionId);

      // Verify token hash
      const isValid = await bcrypt.compare(refreshTokenStr, session.token);
      if (!isValid) {
        // Reuse detected! Revoke the session
        await this.prisma.userSession.update({
          where: { id: session.id },
          data: { revokedAt: new Date(), revokedReason: 'TOKEN_REUSED' }
        });
        forgetSessions();
        throw new UnauthorizedException({ message: 'Session revoked due to token reuse', error: 'SESSION_REVOKED' });
      }

      // Generate new tokens
      const newPayload = {
        sub: user.id,
        email: user.email,
        role: user.role,
        companyId: user.companyId,
        sessionId,
      };

      const newRefreshToken = this.jwtService.sign(newPayload, {
        secret: process.env.JWT_REFRESH_SECRET,
        expiresIn: '7d',
      });
      const newHash = await bcrypt.hash(newRefreshToken, 10);

      // Rotate hash in db
      await this.prisma.userSession.update({
        where: { id: session.id },
        data: { token: newHash }
      });

      const accessToken = this.jwtService.sign(newPayload, { expiresIn: '15m' });

      return { access_token: accessToken, refresh_token: newRefreshToken };
    } catch (e: any) {
      if (e instanceof UnauthorizedException) {
        throw e;
      }
      // Only a bad or expired token is a 401. A database timeout used to be
      // reported as "expired" too, which signed the learner out.
      if (e?.name === 'TokenExpiredError' || e?.name === 'JsonWebTokenError' || e?.name === 'NotBeforeError') {
        throw new UnauthorizedException({ message: 'Invalid or expired refresh token', error: 'TOKEN_EXPIRED' });
      }
      throw e;
    }
  }

  /**
   * Get user profile with tenant-specific enrolled programs.
   */
  async getProfile(userId: string) {
    // the two lookups do not depend on each other, so they run together
    const [user, sessions] = await Promise.all([this.prisma.user.findUnique({
      where: { id: userId },
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
          },
        },
      },
    }),
      // upcoming sessions of every batch the user is in
      this.prisma.session.findMany({
        where: {
          batch: { enrolments: { some: { userId } } },
          endTime: { gt: new Date() }, // Only future or ongoing sessions
        },
        orderBy: { startTime: 'asc' },
        take: 5,
      }),
    ]);

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const enrolledPrograms = user.enrolments.map((e) => {
      let totalItems = 0;
      let completedItems = 0;
      // lessons and quizzes still to do, in course order (for "My Courses")
      const pending: { stepId: string; step: number; stepTitle: string; title: string; kind: 'LESSON' | 'QUIZ' }[] = [];

      const steps = [...(e.batch?.program?.steps || [])].sort((x, y) => x.sequence - y.sequence);
      for (const step of steps) {
        // Count lessons
        for (const lesson of step.lessons || []) {
          totalItems++;
          const lp = e.lessonProgress?.find(p => p.lessonId === lesson.id);
          if (lp?.viewed) completedItems++;
          else pending.push({ stepId: step.id, step: step.sequence, stepTitle: step.title, title: lesson.title, kind: 'LESSON' });
        }
        // Count quiz
        if (step.quiz) {
          totalItems++;
          const attempt = e.attempts?.find(a => a.quizId === step.quiz?.id && a.status === 'PASSED');
          if (attempt) completedItems++;
          else pending.push({ stepId: step.id, step: step.sequence, stepTitle: step.title, title: 'Step quiz', kind: 'QUIZ' });
        }
      }

      const progress = totalItems === 0 ? 0 : Math.round((completedItems / totalItems) * 100);

      return {
        enrolmentId: e.id,
        batchId: e.batchId,
        batchName: e.batch.name,
        programId: e.batch.programId,
        programTitle: e.batch.program.title,
        status: e.status,
        progress: progress, // Dynamic progress added
        totalItems,
        completedItems,
        pending,
      };
    });

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      companyId: user.companyId,
      enrolledPrograms,
      upcomingSessions: sessions,
    };
  }

  /**
   * Helper: Create a device session and enforce limits
   */
  async createDeviceSession(userId: string, role: string, tokenHash: string): Promise<string> {
    const maxSessions = role === Role.USER ? 1 : 3;

    // Two statements in one transaction, instead of four: each statement is a
    // round trip to the database. The lock makes two sign-ins at the same
    // moment take turns; the second statement then revokes whatever exceeds
    // the limit (keeping the newest maxSessions - 1) and adds the new session.
    const id = randomUUID();
    await this.prisma.$transaction([
      this.prisma.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`,
      this.prisma.$executeRaw`
        WITH revoked AS (
          UPDATE "UserSession"
          SET "revokedAt" = now(), "revokedReason" = 'NEW_LOGIN'
          WHERE id IN (
            SELECT id FROM "UserSession"
            WHERE "userId" = ${userId} AND "revokedAt" IS NULL
            ORDER BY "createdAt" DESC
            OFFSET ${maxSessions - 1}
          )
        )
        INSERT INTO "UserSession" (id, "userId", token, "lastActive", "createdAt")
        VALUES (${id}, ${userId}, ${tokenHash}, now(), now())`,
    ]);
    const sessionId = id;

    // older sessions may just have been revoked
    forgetSessions();
    return sessionId;
  }

  /**
   * Check if session is revoked
   */
  async checkSession(sessionId: string) {
    if (!sessionId) {
      throw new UnauthorizedException({ message: 'Session ID missing', error: 'INVALID_CREDENTIALS' });
    }

    const session = await this.prisma.userSession.findUnique({
      where: { id: sessionId },
    });

    if (!session || session.revokedAt) {
      throw new UnauthorizedException({ message: 'Session has been revoked', error: 'SESSION_REVOKED' });
    }

    return session;
  }

  /**
   * Logout all sessions
   */
  async logoutAll(userId: string) {
    const res = await this.prisma.userSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: 'LOGOUT_ALL' }
    });
    forgetSessions();
    
    await this.prisma.logAction({
      actorId: userId,
      action: 'LOGOUT_ALL_SESSIONS',
      entity: 'User',
      entityId: userId,
      meta: { count: res.count }
    });

    return { success: true, count: res.count };
  }
}
