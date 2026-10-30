import { getAppUrls } from '../../common/config/app-urls.js';
import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service.js';
import { Role, EnrolmentStatus, ContentStatus, AttemptStatus } from '@prisma/client';
import { SignupDto } from './dto/index.js';
import * as bcrypt from 'bcryptjs';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { EmailService } from '../email/email.service.js';
import { markDailyAttendance } from '../../common/daily-attendance.js';
import { forgetSessions } from '../../common/session-cache.js';
import { CacheHelperService } from '../../common/cache/cache-helper.service.js';
import { getRolePermissions } from '../../config/permissions.config.js';
import { isValidIanaTimezone } from '../../common/timezone/timezone.util.js';
import {
  generateTotpSecret,
  generateOtpauthUri,
  verifyTotp,
  encryptTotpSecret,
  decryptTotpSecret,
  generateBackupCodes,
  hashBackupCode,
} from './totp.util.js';

export interface DeviceSessionMetadata {
  deviceFingerprint?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  country?: string | null;
  expiresAt?: Date | null;
}

@Injectable()
export class AuthService {
  private readonly otpCache = new Map<string, { code: string; expiresAt: number; attempts: number }>();

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private cacheHelper: CacheHelperService,
    @Optional() private emailService?: EmailService,
  ) {}

  /**
   * Helper: Retrieve stored OTP record from Redis cache, local fallback, or DB.
   */
  private async getOtpRecord(normalizedEmail: string): Promise<{ code: string; expiresAt: number; attempts: number } | null> {
    const redisData = await this.cacheHelper.get<{ code: string; expiresAt: number; attempts: number }>(`auth_otp:${normalizedEmail}`);
    if (redisData) {
      return redisData;
    }
    const memData = this.otpCache.get(normalizedEmail);
    if (memData) {
      return { code: memData.code, expiresAt: memData.expiresAt, attempts: memData.attempts ?? 0 };
    }
    return null;
  }

  /**
   * Helper: Save stored OTP record across Redis and local cache.
   */
  private async saveOtpRecord(normalizedEmail: string, record: { code: string; expiresAt: number; attempts: number }): Promise<void> {
    this.otpCache.set(normalizedEmail, record);
    const ttlSeconds = Math.max(1, Math.floor((record.expiresAt - Date.now()) / 1000));
    await this.cacheHelper.set(`auth_otp:${normalizedEmail}`, record, ttlSeconds);
  }

  /**
   * Helper: Invalidate OTP record across caches.
   */
  private async clearOtpRecord(normalizedEmail: string): Promise<void> {
    this.otpCache.delete(normalizedEmail);
    await this.cacheHelper.del(`auth_otp:${normalizedEmail}`);
  }

  /**
   * Production-level login: validates email + password hash, returns JWT.
   */
  /** Mobile numbers are stored and compared as digits with an optional leading +. */
  private normalizePhone(phone: string) {
    const trimmed = phone.trim();
    return (trimmed.startsWith('+') ? '+' : '') + trimmed.replace(/\D/g, '');
  }

  /**
   * Helper: Record login audit entry in a non-blocking safe manner (D1-024).
   * Flags suspicious login activity on failed attempts, country mismatch, or country-hopping.
   */
  private async recordLoginAudit(params: {
    userId: string;
    ipAddress?: string | null;
    userAgent?: string | null;
    country?: string | null;
    deviceFingerprint?: string | null;
    isSuspicious?: boolean;
    reason?: string | null;
    userCountry?: string | null;
    userRole?: string | Role | null;
  }): Promise<void> {
    if (!params.userId || !this.prisma?.loginAudit) return;

    try {
      let isSuspicious = params.isSuspicious ?? false;

      // Country-hopping / anomaly detection
      if (!isSuspicious && params.country) {
        const reqCountry = params.country.trim().toUpperCase();

        if (params.userCountry && params.userCountry.trim().toUpperCase() !== reqCountry) {
          isSuspicious = true;
        } else if (typeof this.prisma.loginAudit.findFirst === 'function') {
          const lastAudit = await this.prisma.loginAudit.findFirst({
            where: { userId: params.userId, country: { not: null } },
            orderBy: { createdAt: 'desc' },
            select: { country: true },
          }).catch(() => null);

          if (lastAudit?.country && lastAudit.country.trim().toUpperCase() !== reqCountry) {
            isSuspicious = true;
          }
        }
      }

      if (typeof this.prisma.loginAudit.create === 'function') {
        await this.prisma.loginAudit.create({
          data: {
            userId: params.userId,
            ipAddress: params.ipAddress ?? null,
            userAgent: params.userAgent ?? null,
            country: params.country ?? null,
            deviceFingerprint: params.deviceFingerprint ?? null,
            isSuspicious,
            reason: params.reason ?? null,
          },
        });
      }

      // PDF Page 13: Log unusual activity, such as many logins from different countries, for admin review
      if (isSuspicious) {
        const suspiciousAuditData = {
          actorId: params.userId,
          action: 'UNUSUAL_LOGIN_DETECTED',
          entity: 'User',
          entityId: params.userId,
          meta: {
            country: params.country ?? null,
            ipAddress: params.ipAddress ?? null,
            userAgent: params.userAgent ?? null,
            reason: params.reason || 'Unusual login activity detected (country hopping or suspicious pattern)',
          },
          ip: params.ipAddress ?? null,
        };
        if (typeof (this.prisma as any).logAction === 'function') {
          await (this.prisma as any).logAction(suspiciousAuditData).catch(() => null);
        } else if (typeof (this.prisma as any).auditLog?.create === 'function') {
          await (this.prisma as any).auditLog.create({ data: suspiciousAuditData }).catch(() => null);
        }
      }

      // Resolve user role to distinguish privileged staff from learners
      let userRole = params.userRole;
      if (!userRole && typeof this.prisma?.user?.findUnique === 'function') {
        const u = await this.prisma.user.findUnique({
          where: { id: params.userId },
          select: { role: true },
        }).catch(() => null);
        userRole = u?.role;
      }
      const isPrivilegedStaff = userRole && userRole !== Role.USER && userRole !== 'USER';

      // PDF Pages 4, 5 & 13: Log privileged staff sign-ins to immutable AuditLog for compliance and forensic accountability.
      // Routine learner (USER) logins are safely preserved in the dedicated LoginAudit table above and excluded from AuditLog
      // to prevent production database flooding (millions of rows/year). Security alerts (isSuspicious) remain logged above for ALL users.
      if (
        isPrivilegedStaff &&
        !isSuspicious &&
        (params.reason === 'SUCCESS' ||
          params.reason === 'SUCCESS_SETUP_REQUIRED' ||
          params.reason === '2FA_SUCCESS')
      ) {
        let loginDetail = 'Staff signed in successfully';
        if (params.reason === '2FA_SUCCESS') {
          loginDetail = 'Signed in with two-factor authentication';
        } else if (params.reason === 'SUCCESS_SETUP_REQUIRED') {
          loginDetail = 'Signed in successfully (2FA setup pending)';
        }

        const loginAuditData = {
          actorId: params.userId,
          action: 'LOGIN',
          entity: 'UserSession',
          entityId: params.userId,
          meta: {
            country: params.country ?? null,
            ipAddress: params.ipAddress ?? null,
            userAgent: params.userAgent ?? null,
            deviceFingerprint: params.deviceFingerprint ?? null,
            role: userRole,
            reason: loginDetail,
          },
          ip: params.ipAddress ?? null,
        };

        if (typeof (this.prisma as any).logAction === 'function') {
          await (this.prisma as any).logAction(loginAuditData).catch(() => null);
        } else if (typeof (this.prisma as any).auditLog?.create === 'function') {
          await (this.prisma as any).auditLog.create({ data: loginAuditData }).catch(() => null);
        }
      }
    } catch {
      // Non-blocking: audit write failure must not break the authentication flow
    }
  }

  /** `identifier` is the account email, or its mobile number. */
  async login(
    identifier: string,
    password: string,
    metadata?: DeviceSessionMetadata,
  ) {
    const trimmedIdentifier = identifier?.trim() || '';
    if (!trimmedIdentifier || !password) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const include = {
      enrolments: {
        select: {
          id: true,
          status: true,
          batchId: true,
          batch: {
            select: {
              name: true,
              status: true,
              programId: true,
              program: {
                select: { title: true, status: true }
              }
            }
          }
        }
      },
    };

    let user;
    if (trimmedIdentifier.includes('@')) {
      const normalizedEmail = trimmedIdentifier.toLowerCase();
      user = await this.prisma.user.findUnique({ where: { email: normalizedEmail }, include });
    } else {
      // a number only signs in when exactly one account holds it
      const normalizedPhone = this.normalizePhone(trimmedIdentifier);
      const matches = await this.prisma.user.findMany({
        where: {
          phone: { in: [normalizedPhone, trimmedIdentifier] },
          deletedAt: null,
        },
        include,
        take: 2,
      });
      user = matches.length === 1 ? matches[0] : null;
    }

    if (!user || !user.passwordHash || user.deletedAt) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const passwordValid = await bcrypt.compare(password, user.passwordHash);
    if (!passwordValid) {
      await this.recordLoginAudit({
        userId: user.id,
        ipAddress: metadata?.ipAddress,
        userAgent: metadata?.userAgent,
        country: metadata?.country,
        deviceFingerprint: metadata?.deviceFingerprint,
        isSuspicious: true,
        reason: 'INVALID_PASSWORD',
        userCountry: user.country,
      });
      throw new UnauthorizedException('Invalid email or password');
    }

    if (user.permissions?.includes('ACCOUNT_SUSPENDED')) {
      throw new UnauthorizedException('Your account has been temporarily suspended. Please contact support.');
    }

    const requireVerification =
      process.env.REQUIRE_EMAIL_VERIFICATION === 'true' ||
      process.env.NODE_ENV === 'test';
    if (!user.emailVerifiedAt && requireVerification) {
      await this.recordLoginAudit({
        userId: user.id,
        ipAddress: metadata?.ipAddress,
        userAgent: metadata?.userAgent,
        country: metadata?.country,
        deviceFingerprint: metadata?.deviceFingerprint,
        isSuspicious: true,
        reason: 'UNVERIFIED_EMAIL',
        userCountry: user.country,
      });
      throw new UnauthorizedException('Please verify your email before logging in');
    }

    // Security check (D1-022): prevent 2FA bypass by calling /auth/login instead of /auth/admin-login
    if ((user.role === Role.SUPER_ADMIN || user.role === Role.ADMIN) && user.twoFactorEnabled) {
      await this.recordLoginAudit({
        userId: user.id,
        ipAddress: metadata?.ipAddress,
        userAgent: metadata?.userAgent,
        country: metadata?.country,
        deviceFingerprint: metadata?.deviceFingerprint,
        isSuspicious: false,
        reason: '2FA_CHALLENGED',
        userCountry: user.country,
      });
      const tempToken = this.jwtService.sign(
        { sub: user.id, purpose: '2fa_login' },
        {
          secret: process.env.JWT_SECRET || 'fallback-secret',
          expiresIn: '5m',
        },
      );
      return {
        requires2fa: true,
        tempToken,
      };
    }

    const sessionId = randomUUID();

    // Build payload for refresh token bound to the created session
    const refreshPayload = {
      sub: user.id,
      sessionId,
    };

    const refreshToken = this.jwtService.sign(refreshPayload, {
      secret: process.env.JWT_REFRESH_SECRET || 'fallback-refresh-secret',
      expiresIn: '7d',
    });

    // Hash the refresh token and store it
    const tokenHash = await bcrypt.hash(refreshToken, 10);

    // Enforce device limits and store session
    await this.createDeviceSession(user.id, user.role, tokenHash, metadata, sessionId);

    // Build JWT payload with user role and tenant context (enrolled programs)
    const accessPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      permissions: Array.from(new Set([
        ...(user.permissions || []),
        ...getRolePermissions(user.role)
      ])),
      companyId: user.companyId,
      sessionId,
    };

    const accessToken = this.jwtService.sign(accessPayload, { expiresIn: '15m' });

    // signing in counts as attending today
    // not awaited: it must not hold up the sign-in (it never throws)
    if (user.role === Role.USER) void markDailyAttendance(this.prisma, user.id, 'visited');

    await this.recordLoginAudit({
      userId: user.id,
      ipAddress: metadata?.ipAddress,
      userAgent: metadata?.userAgent,
      country: metadata?.country,
      deviceFingerprint: metadata?.deviceFingerprint,
      isSuspicious: false,
      reason: 'SUCCESS',
      userCountry: user.country,
    });

    // Return user data with enrolled programs for tenant separation
    const enrolledPrograms = user.enrolments?.filter((e) => e.batch?.status !== 'ARCHIVED').map((e) => ({
      enrolmentId: e.id,
      batchId: e.batchId,
      batchName: e.batch?.name,
      programId: e.batch?.programId,
      programTitle: e.batch?.program?.title,
      status: e.status,
    })) || [];

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        phone: user.phone,
        role: user.role,
        companyId: user.companyId,
        country: user.country,
        timezone: user.timezone,
        permissions: Array.from(new Set([
          ...(user.permissions || []),
          ...getRolePermissions(user.role)
        ])),
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

    // If OTP code is provided, verify it against the distributed cache
    if (data.otp) {
      const trimmedOtp = data.otp.trim();
      const cached = await this.getOtpRecord(normalizedEmail);

      if (!cached || cached.expiresAt < Date.now()) {
        throw new BadRequestException('Invalid or expired verification code');
      }

      if (cached.attempts >= 5) {
        await this.clearOtpRecord(normalizedEmail);
        throw new BadRequestException('Too many failed verification attempts. Please request a new code.');
      }

      if (cached.code !== trimmedOtp) {
        cached.attempts += 1;
        await this.saveOtpRecord(normalizedEmail, cached);
        throw new BadRequestException('Invalid or expired verification code');
      }

      await this.clearOtpRecord(normalizedEmail);
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
          emailVerifiedAt: data.otp ? new Date() : null,
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

    if (this.emailService) {
      const { lmsUrl } = getAppUrls();
      const firstName = user.name ? (user.name.split(' ')[0] || user.name) : 'Student';
      // 1. Send Welcome Email
      this.emailService
        .sendTemplateEmail({
          to: user.email,
          subject: 'Welcome to WhatBoutMe!',
          template: 'SignupWelcomeEmail',
          props: {
            firstName,
            loginUrl: `${lmsUrl}/login`,
          },
        })
        .catch((e: any) => console.warn('[AuthService] Welcome email error:', e?.message));

      // 2. Only send link verification email if not already verified via OTP
      if (!user.emailVerifiedAt) {
        const verificationUrl = `${lmsUrl}/verify-email?token=${verificationToken}`;
        this.emailService
          .sendTemplateEmail({
            to: user.email,
            subject: 'Verify your email address - WhatBoutMe',
            template: 'EmailVerificationEmail',
            props: {
              firstName,
              verificationUrl,
            },
          })
          .catch((e: any) => console.warn('[AuthService] Verification email error:', e?.message));
      }
    }

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
          select: {
            id: true,
            status: true,
            batchId: true,
            batch: {
              select: {
                name: true, status: true, programId: true,
                program: {
                  select: { title: true, status: true }
                }
              }
            }
          }
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

    await this.cacheHelper.invalidateNamespace('users');
    if (data.programIds && data.programIds.length > 0) {
      await this.cacheHelper.invalidateNamespace('batches');
    }

    const sessionId = randomUUID();
    const refreshPayload = { sub: user.id, sessionId };
    const refreshToken = this.jwtService.sign(refreshPayload, {
      secret: process.env.JWT_REFRESH_SECRET || 'fallback-refresh-secret',
      expiresIn: '7d',
    });
    const tokenHash = await bcrypt.hash(refreshToken, 10);
    await this.createDeviceSession(user.id, user.role, tokenHash, {}, sessionId);

    const accessPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      permissions: Array.from(new Set([
        ...(user.permissions || []),
        ...getRolePermissions(user.role),
      ])),
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
  async adminLogin(
    email: string,
    password: string,
    metadata?: DeviceSessionMetadata,
    loginType?: string,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    const adminRoles: string[] = [Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGER, Role.TEACHER];
    const isPlatformAdmin = user ? adminRoles.includes(user.role) : false;

    const orgMembership = user
      ? await this.prisma.organizationMember.findFirst({
          where: { userId: user.id },
          include: {
            organization: true,
          },
        })
      : null;

    const isOrgPortal = loginType === 'organization';

    if (isOrgPortal) {
      // For organization partners: if account doesn't exist, tell them clearly
      if (!user || !orgMembership) {
        throw new UnauthorizedException('No organization is found for this email address');
      }

      if (
        orgMembership.organization.status === 'SUSPENDED' ||
        orgMembership.organization.status === 'ARCHIVED'
      ) {
        throw new UnauthorizedException(
          `This organization workspace is currently ${orgMembership.organization.status.toLowerCase()}. Please contact WhatBoutMe administration.`,
        );
      }

      if (!user.passwordHash) {
        throw new UnauthorizedException('Please set up your organization password using the invite link sent to your email');
      }

      const passwordValid = await bcrypt.compare(password, user.passwordHash);
      if (!passwordValid) {
        await this.recordLoginAudit({
          userId: user.id,
          ipAddress: metadata?.ipAddress,
          userAgent: metadata?.userAgent,
          country: metadata?.country,
          deviceFingerprint: metadata?.deviceFingerprint,
          isSuspicious: true,
          reason: 'INVALID_PASSWORD',
          userCountry: user.country,
        });
        throw new UnauthorizedException('Invalid email or password');
      }
    } else {
      if (!user || !user.passwordHash) {
        throw new UnauthorizedException('Invalid email or password');
      }

      if (!isPlatformAdmin && !orgMembership) {
        await this.recordLoginAudit({
          userId: user.id,
          ipAddress: metadata?.ipAddress,
          userAgent: metadata?.userAgent,
          country: metadata?.country,
          deviceFingerprint: metadata?.deviceFingerprint,
          isSuspicious: true,
          reason: 'INSUFFICIENT_PERMISSIONS',
          userCountry: user.country,
        });
        throw new UnauthorizedException('No organization is found for this email address');
      }

      const passwordValid = await bcrypt.compare(password, user.passwordHash);
      if (!passwordValid) {
        await this.recordLoginAudit({
          userId: user.id,
          ipAddress: metadata?.ipAddress,
          userAgent: metadata?.userAgent,
          country: metadata?.country,
          deviceFingerprint: metadata?.deviceFingerprint,
          isSuspicious: true,
          reason: 'INVALID_PASSWORD',
          userCountry: user.country,
        });
        throw new UnauthorizedException('Invalid email or password');
      }
    }

    // If SUPER_ADMIN or ADMIN and 2FA is enabled: DO NOT create a session yet!
    if ((user.role === Role.SUPER_ADMIN || user.role === Role.ADMIN) && user.twoFactorEnabled) {
      await this.recordLoginAudit({
        userId: user.id,
        ipAddress: metadata?.ipAddress,
        userAgent: metadata?.userAgent,
        country: metadata?.country,
        deviceFingerprint: metadata?.deviceFingerprint,
        isSuspicious: false,
        reason: '2FA_CHALLENGED',
        userCountry: user.country,
      });
      const tempToken = this.jwtService.sign(
        { sub: user.id, purpose: '2fa_login' },
        {
          secret: process.env.JWT_SECRET || 'fallback-secret',
          expiresIn: '5m',
        },
      );
      return {
        requires2fa: true,
        tempToken,
      };
    }

    const sessionId = randomUUID();
    const refreshPayload = { sub: user.id, sessionId };
    const refreshToken = this.jwtService.sign(refreshPayload, {
      secret: process.env.JWT_REFRESH_SECRET || 'fallback-refresh-secret',
      expiresIn: '7d',
    });
    const tokenHash = await bcrypt.hash(refreshToken, 10);

    // Enforce device limits
    await this.createDeviceSession(user.id, user.role, tokenHash, metadata, sessionId);

    const accessPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      permissions: Array.from(new Set([
        ...(user.permissions || []),
        ...getRolePermissions(user.role)
      ])),
      companyId: user.companyId,
      sessionId,
    };

    const accessToken = this.jwtService.sign(accessPayload, { expiresIn: '15m' });

    const auditReason =
      user.role === Role.SUPER_ADMIN || user.role === Role.ADMIN
        ? 'SUCCESS_SETUP_REQUIRED'
        : 'SUCCESS';

    await this.recordLoginAudit({
      userId: user.id,
      ipAddress: metadata?.ipAddress,
      userAgent: metadata?.userAgent,
      country: metadata?.country,
      deviceFingerprint: metadata?.deviceFingerprint,
      isSuspicious: false,
      reason: auditReason,
      userCountry: user.country,
    });

    const response: any = {
      access_token: accessToken,
      refresh_token: refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        isOrgUser: !isPlatformAdmin && Boolean(orgMembership),
        organizationId: orgMembership?.organizationId || null,
        organization: orgMembership ? { id: orgMembership.organization.id, name: orgMembership.organization.name, orgCode: orgMembership.organization.orgCode, role: orgMembership.role, isAuthorizedReseller: orgMembership.organization.isAuthorizedReseller } : null,
        orgRole: orgMembership?.role || null,
        permissions: Array.from(new Set([
          ...(user.permissions || []),
          ...getRolePermissions(user.role)
        ])),
      },
    };

    if (user.role === Role.SUPER_ADMIN || user.role === Role.ADMIN) {
      response.requires2faSetup = true;
    }

    return response;
  }

  /**
   * Refresh token endpoint (D1-018: JWT Access/Refresh Token Rotation)
   */
  async refreshToken(refreshTokenStr: string) {
    if (!refreshTokenStr || typeof refreshTokenStr !== 'string') {
      throw new UnauthorizedException({ message: 'Invalid or expired refresh token', error: 'TOKEN_EXPIRED' });
    }

    try {
      const payload = this.jwtService.verify(refreshTokenStr, {
        secret: process.env.JWT_REFRESH_SECRET || 'fallback-refresh-secret',
      });

      if (!payload || !payload.sub) {
        throw new UnauthorizedException({ message: 'Invalid or expired refresh token', error: 'TOKEN_EXPIRED' });
      }

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
      });

      if (!user || user.deletedAt) {
        throw new UnauthorizedException({ message: 'Invalid or expired refresh token', error: 'TOKEN_EXPIRED' });
      }

      if (user.permissions?.includes('ACCOUNT_SUSPENDED')) {
        throw new UnauthorizedException({ message: 'Your account has been temporarily suspended', error: 'ACCOUNT_SUSPENDED' });
      }

      let targetSessionId = payload.sessionId;

      if (!targetSessionId) {
        // Fallback for legacy tokens without embedded sessionId
        const active = await this.prisma.userSession.findMany({
          where: {
            userId: user.id,
            revokedAt: null,
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
          },
          orderBy: { createdAt: 'desc' },
        });

        for (const candidate of active) {
          if (await bcrypt.compare(refreshTokenStr, candidate.token)) {
            targetSessionId = candidate.id;
            break;
          }
        }

        if (!targetSessionId) {
          throw new UnauthorizedException({ message: 'Session has expired or been revoked', error: 'SESSION_REVOKED', reason: 'SESSION_REVOKED' });
        }
      }

      // Execute serialized rotation inside a PostgreSQL transaction with an advisory lock on the session ID.
      // This prevents race conditions where simultaneous requests with the same token both validate before either rotates.
      const result = await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${targetSessionId}))`;

        // Fetch fresh session state under lock
        const session = await tx.userSession.findUnique({
          where: { id: targetSessionId },
        });

        if (
          !session ||
          session.userId !== user.id ||
          session.revokedAt !== null ||
          (session.expiresAt && session.expiresAt <= new Date())
        ) {
          return {
            status: 'SESSION_REVOKED' as const,
            reason: session?.revokedReason || (session?.expiresAt && session.expiresAt <= new Date() ? 'EXPIRED' : 'SESSION_REVOKED'),
          };
        }

        // Verify token hash against the current, locked session token
        const isValid = await bcrypt.compare(refreshTokenStr, session.token);
        if (!isValid) {
          // Reuse detected! Revoke the session immediately to protect against token theft.
          // We commit this update inside the transaction boundary so it is permanently written to PostgreSQL.
          await tx.userSession.update({
            where: { id: session.id },
            data: { revokedAt: new Date(), revokedReason: 'TOKEN_REUSED' },
          });
          return {
            status: 'TOKEN_REUSED' as const,
            reason: 'TOKEN_REUSED' as const,
          };
        }

        // Generate rotated tokens
        const newPayload = {
          sub: user.id,
          email: user.email,
          role: user.role,
          permissions: Array.from(new Set([
            ...(user.permissions || []),
            ...getRolePermissions(user.role)
          ])),
          companyId: user.companyId,
          sessionId: session.id,
        };

        const newRefreshToken = this.jwtService.sign(newPayload, {
          secret: process.env.JWT_REFRESH_SECRET || 'fallback-refresh-secret',
          expiresIn: '7d',
        });
        const newHash = await bcrypt.hash(newRefreshToken, 10);
        const newExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

        // Rotate token hash in database, update lastActive and extend expiresAt
        await tx.userSession.update({
          where: { id: session.id },
          data: {
            token: newHash,
            lastActive: new Date(),
            expiresAt: newExpiresAt,
          },
        });

        const accessToken = this.jwtService.sign(newPayload, { expiresIn: '15m' });

        return {
          status: 'SUCCESS' as const,
          tokens: { access_token: accessToken, refresh_token: newRefreshToken },
        };
      });

      if (result.status === 'TOKEN_REUSED') {
        forgetSessions();
        await this.cacheHelper.invalidateNamespace(`auth_user:${user.id}`);
        throw new UnauthorizedException({
          message: 'Session revoked due to token reuse',
          error: 'SESSION_REVOKED',
          reason: 'TOKEN_REUSED',
        });
      }

      if (result.status === 'SESSION_REVOKED') {
        throw new UnauthorizedException({
          message: result.reason === 'DEVICE_LIMIT_EXCEEDED'
            ? 'You were logged out because this account was logged in from another device'
            : 'Session has expired or been revoked',
          error: 'SESSION_REVOKED',
          reason: result.reason,
        });
      }

      return result.tokens;
    } catch (e: any) {
      if (e instanceof UnauthorizedException) {
        throw e;
      }
      // Only a bad or expired token is a 401
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
    const cacheKey = await this.cacheHelper.getVersionedKey(`auth_user:${userId}`, 'profile');
    return this.cacheHelper.getOrSet(
      cacheKey,
      async () => {
        // the lookups do not depend on each other, so they run together
        const [user, sessions, orgMembership] = await Promise.all([
          this.prisma.user.findUnique({
            where: { id: userId },
            select: {
              id: true,
              email: true,
              name: true,
              phone: true,
              role: true,
              permissions: true,
              companyId: true,
              country: true,
              timezone: true,
              createdAt: true,
              enrolments: {
                select: {
                  id: true,
                  status: true,
                  batchId: true,
                  curriculumCompletedAt: true,
                  currentStage: true,
                  missionStatementApprovedAt: true,
                  examPassedAt: true,
                  oneOnOneCompletedAt: true,
                  batch: {
                    select: {
                      name: true, status: true, programId: true,
                      program: { select: { title: true, status: true } }
                    }
                  }
                }
              }
            }
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
          this.prisma.organizationMember ? this.prisma.organizationMember.findFirst({
            where: { userId },
            include: {
              organization: {
                select: {
                  id: true,
                  name: true,
                  orgCode: true,
                  status: true,
                  orgType: true,
                },
              },
            },
          }) : Promise.resolve(null),
        ]);

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const programIds = [
      ...new Set(user.enrolments.map((e) => e.batch?.programId).filter(Boolean)),
    ] as string[];
    const enrolmentIds = user.enrolments.map((e) => e.id);

    const stepsByProgram: Record<string, any[]> = {};

    if (programIds.length > 0) {
      const publishedSteps = await this.prisma.step.findMany({
        where: {
          programId: { in: programIds },
          status: ContentStatus.PUBLISHED,
        },
        select: {
          id: true,
          programId: true,
          sequence: true,
          lessons: {
            where: { status: ContentStatus.PUBLISHED },
            select: { id: true },
          },
          quiz: { select: { id: true } },
        },
      });

      for (const step of publishedSteps) {
        if (!stepsByProgram[step.programId]) {
          stepsByProgram[step.programId] = [];
        }
        stepsByProgram[step.programId].push(step);
      }
    }

    const viewedLessonSetByEnrolment: Record<string, Set<string>> = {};
    const passedQuizSetByEnrolment: Record<string, Set<string>> = {};
    const completedStepSetByEnrolment: Record<string, Set<string>> = {};

    if (enrolmentIds.length > 0) {
      const [lessonProgress, passedAttempts, stepProgressList] = await Promise.all([
        this.prisma.userLessonProgress.findMany({
          where: {
            enrolmentId: { in: enrolmentIds },
            viewed: true,
          },
          select: { enrolmentId: true, lessonId: true },
        }),
        this.prisma.attempt.findMany({
          where: {
            enrolmentId: { in: enrolmentIds },
            OR: [
              { status: AttemptStatus.PASSED },
              { passed: true },
            ],
          },
          select: { enrolmentId: true, quizId: true },
        }),
        typeof this.prisma.stepProgress?.findMany === 'function'
          ? this.prisma.stepProgress.findMany({
              where: {
                enrolmentId: { in: enrolmentIds },
                isCompleted: true,
              },
              select: { enrolmentId: true, stepId: true },
            })
          : [],
      ]);

      for (const lp of lessonProgress) {
        if (!viewedLessonSetByEnrolment[lp.enrolmentId]) {
          viewedLessonSetByEnrolment[lp.enrolmentId] = new Set();
        }
        viewedLessonSetByEnrolment[lp.enrolmentId].add(lp.lessonId);
      }

      for (const a of passedAttempts) {
        if (!passedQuizSetByEnrolment[a.enrolmentId]) {
          passedQuizSetByEnrolment[a.enrolmentId] = new Set();
        }
        passedQuizSetByEnrolment[a.enrolmentId].add(a.quizId);
      }

      for (const sp of stepProgressList) {
        if (!completedStepSetByEnrolment[sp.enrolmentId]) {
          completedStepSetByEnrolment[sp.enrolmentId] = new Set();
        }
        completedStepSetByEnrolment[sp.enrolmentId].add(sp.stepId);
      }
    }

    const enrolledPrograms = user.enrolments.filter((e) => e.batch?.status !== 'ARCHIVED').map((e: any) => {
      const programId = e.batch?.programId;
      const steps = programId ? stepsByProgram[programId] || [] : [];
      const viewedLessons = viewedLessonSetByEnrolment[e.id] || new Set();
      const passedQuizzes = passedQuizSetByEnrolment[e.id] || new Set();
      const completedSteps = completedStepSetByEnrolment[e.id] || new Set();

      let totalItems = 0;
      let completedItems = 0;

      for (const step of steps) {
        const sTotal = (step.lessons?.length || 0) + (step.quiz ? 1 : 0);
        totalItems += sTotal;
        const isStepCompleted = completedSteps.has(step.id);
        if (isStepCompleted) {
          completedItems += sTotal;
        } else {
          const viewedInStep = (step.lessons || []).filter((l: any) => viewedLessons.has(l.id)).length;
          const quizPassedInStep = step.quiz && passedQuizzes.has(step.quiz.id) ? 1 : 0;
          completedItems += viewedInStep + quizPassedInStep;
        }
      }

      const allStepsDone = steps.length > 0 && steps.every((s: any) => completedSteps.has(s.id));
      const isCurriculumFinished =
        allStepsDone ||
        Boolean(e.curriculumCompletedAt) ||
        e.status === 'COMPLETED' ||
        Boolean(e.missionStatementApprovedAt);

      if (isCurriculumFinished && totalItems > 0) {
        completedItems = totalItems;
      }

      const progress =
        totalItems > 0
          ? completedItems >= totalItems
            ? 100
            : Math.floor((completedItems / totalItems) * 100)
          : (isCurriculumFinished ? 100 : 0);

      return {
        enrolmentId: e.id,
        batchId: e.batchId,
        batchName: e.batch?.name,
        programId: e.batch?.programId,
        programTitle: e.batch?.program?.title || 'Unknown',
        status: e.status,
        progress,
        totalItems,
        completedItems,
        pending: [],
      };
    });

    const adminRoles: string[] = [Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGER, Role.TEACHER];
    const isPlatformAdmin = adminRoles.includes(user.role);
    const isOrgUser = !isPlatformAdmin && Boolean(orgMembership);

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      companyId: user.companyId,
      country: user.country,
      timezone: user.timezone,
      isOrgUser,
      organizationId: orgMembership?.organizationId || null,
      organization: orgMembership?.organization || null,
      orgRole: orgMembership?.role || null,
      enrolledPrograms,
      upcomingSessions: sessions,
    };
      },
      30, // 30-second TTL prevents stale progression while shielding DB from request storms
    );
  }

  /**
   * Update the authenticated user's preferred timezone.
   */
  async updateTimezone(userId: string, timezone: string) {
    if (!timezone || !isValidIanaTimezone(timezone)) {
      throw new BadRequestException(`Invalid IANA timezone: ${timezone}`);
    }
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { timezone: timezone.trim() },
      select: {
        id: true,
        email: true,
        name: true,
        timezone: true,
        country: true,
      },
    });
    const cacheKey = await this.cacheHelper.getVersionedKey(`auth_user:${userId}`, 'profile');
    await this.cacheHelper.del(cacheKey);
    return updated;
  }

  /**
   * Helper: Create a device session and enforce limits (D1-017: 2 active devices max)
   */
  async createDeviceSession(
    userId: string,
    role: string,
    tokenHash: string,
    metadata?: DeviceSessionMetadata,
    sessionId?: string,
  ): Promise<string> {
    const parsedMax = parseInt(process.env.MAX_ACTIVE_SESSIONS ?? '', 10);
    const maxSessions = Number.isInteger(parsedMax) && parsedMax > 0 ? parsedMax : 2;

    const id = sessionId ?? randomUUID();
    const expiresAt = metadata?.expiresAt ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7d TTL
    const ipAddress = metadata?.ipAddress ?? null;
    const userAgent = metadata?.userAgent ?? null;
    const deviceFingerprint = metadata?.deviceFingerprint ?? null;

    // pg_advisory_xact_lock on userId serializes concurrent logins for the same user.
    // The subquery targets active sessions: revokedAt IS NULL AND (expiresAt IS NULL OR expiresAt > now()).
    // Ordering by createdAt DESC and skipping maxSessions - 1 selects the oldest active sessions beyond the limit.
    await this.prisma.$transaction([
      this.prisma.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`,
      this.prisma.$executeRaw`
        WITH revoked AS (
          UPDATE "UserSession"
          SET "revokedAt" = now(), "revokedReason" = 'DEVICE_LIMIT_EXCEEDED'
          WHERE id IN (
            SELECT id FROM "UserSession"
            WHERE "userId" = ${userId}
              AND "revokedAt" IS NULL
              AND ("expiresAt" IS NULL OR "expiresAt" > now())
            ORDER BY "createdAt" DESC
            OFFSET ${maxSessions - 1}
          )
        )
        INSERT INTO "UserSession" (id, "userId", token, "deviceFingerprint", "ipAddress", "userAgent", "lastActive", "expiresAt", "createdAt")
        VALUES (${id}, ${userId}, ${tokenHash}, ${deviceFingerprint}, ${ipAddress}, ${userAgent}, now(), ${expiresAt}, now())`,
    ]);
    // older sessions may just have been revoked
    forgetSessions();
    await this.cacheHelper.invalidateNamespace(`auth_user:${userId}`);
    return id;
  }

  /**
   * Get all currently active sessions for a user (unrevoked, non-expired)
   */
  async getActiveSessions(userId: string) {
    return this.prisma.userSession.findMany({
      where: {
        userId,
        revokedAt: null,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } },
        ],
      },
      orderBy: { createdAt: 'desc' },
    });
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

    if (!session || session.revokedAt || (session.expiresAt && session.expiresAt <= new Date())) {
      const isDeviceLimit = session?.revokedReason === 'DEVICE_LIMIT_EXCEEDED';
      throw new UnauthorizedException({
        message: isDeviceLimit
          ? 'You were logged out because this account was logged in from another device'
          : 'Session has expired or been revoked',
        error: 'SESSION_REVOKED',
        reason: session?.revokedReason || 'SESSION_REVOKED',
      });
    }

    return session;
  }

  /**
   * Logout current session (D1-023): Revokes the current UserSession, clears session cache, and logs audit event.
   * Idempotent: returns success even if session is already revoked or missing.
   */
  async logout(userId: string, sessionId?: string) {
    if (sessionId) {
      await this.prisma.userSession.updateMany({
        where: { id: sessionId, userId, revokedAt: null },
        data: { revokedAt: new Date(), revokedReason: 'LOGOUT' },
      });
      forgetSessions();
      await this.cacheHelper.invalidateNamespace(`auth_user:${userId}`);

      if (typeof (this.prisma as any).logAction === 'function') {
        await (this.prisma as any).logAction({
          actorId: userId,
          action: 'LOGOUT',
          entity: 'UserSession',
          entityId: sessionId,
          meta: { reason: 'User session signed out' },
        }).catch(() => {});
      }
    } else {
      forgetSessions();
      await this.cacheHelper.invalidateNamespace(`auth_user:${userId}`);
    }

    return { success: true, message: 'Logged out successfully' };
  }

  /**
   * Logout all sessions (D1-023): Revokes all active UserSessions for the user and clears session cache.
   */
  async logoutAll(userId: string) {
    const res = await this.prisma.userSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: 'LOGOUT_ALL' },
    });
    forgetSessions();
    await this.cacheHelper.invalidateNamespace(`auth_user:${userId}`);

    if (typeof (this.prisma as any).logAction === 'function') {
      await (this.prisma as any).logAction({
        actorId: userId,
        action: 'LOGOUT_ALL_SESSIONS',
        entity: 'User',
        entityId: userId,
        meta: { count: res.count, reason: 'All active sessions revoked' },
      }).catch(() => {});
    }

    return {
      success: true,
      count: res.count,
      message: 'All sessions logged out successfully',
    };
  }

  /**
   * List all active sessions for the authenticated user (D1-023).
   * Strips all token hashes and sensitive credentials.
   */
  async getSessions(userId: string, currentSessionId?: string) {
    const sessions = await this.prisma.userSession.findMany({
      where: {
        userId,
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        deviceFingerprint: true,
        ipAddress: true,
        userAgent: true,
        lastActive: true,
        expiresAt: true,
        createdAt: true,
      },
    });

    const parseUA = (ua?: string | null) => {
      if (!ua) return { browser: 'Web Browser', os: 'Unknown OS', deviceType: 'desktop' };
      const lower = ua.toLowerCase();
      let browser = 'Web Browser';
      if (lower.includes('edg/')) browser = 'Microsoft Edge';
      else if (lower.includes('chrome/') && !lower.includes('edg/')) browser = 'Google Chrome';
      else if (lower.includes('firefox/')) browser = 'Mozilla Firefox';
      else if (lower.includes('safari/') && !lower.includes('chrome/')) browser = 'Apple Safari';
      else if (lower.includes('opr/') || lower.includes('opera/')) browser = 'Opera';

      let os = 'Unknown OS';
      if (lower.includes('windows nt 10.0')) os = 'Windows 10/11';
      else if (lower.includes('windows')) os = 'Windows';
      else if (lower.includes('mac os x') || lower.includes('macintosh')) os = 'macOS';
      else if (lower.includes('android')) os = 'Android';
      else if (lower.includes('iphone') || lower.includes('ipad')) os = 'iOS';
      else if (lower.includes('linux')) os = 'Linux';

      let deviceType: 'desktop' | 'mobile' | 'tablet' = 'desktop';
      if (lower.includes('ipad') || lower.includes('tablet')) deviceType = 'tablet';
      else if (lower.includes('mobile') || lower.includes('iphone') || lower.includes('android')) deviceType = 'mobile';

      return { browser, os, deviceType };
    };

    return sessions.map((s) => ({
      id: s.id,
      deviceFingerprint: s.deviceFingerprint,
      ipAddress: s.ipAddress,
      userAgent: s.userAgent,
      deviceInfo: parseUA(s.userAgent),
      lastActive: s.lastActive,
      expiresAt: s.expiresAt,
      createdAt: s.createdAt,
      isCurrent: currentSessionId ? s.id === currentSessionId : false,
    }));
  }

  /**
   * Revoke a specific session belonging to the authenticated user (D1-023).
   * Verifies ownership and invalidates session cache immediately.
   */
  async revokeSession(userId: string, sessionIdToRevoke: string, currentSessionId?: string) {
    if (!sessionIdToRevoke || typeof sessionIdToRevoke !== 'string') {
      throw new BadRequestException('Session ID is required');
    }

    const session = await this.prisma.userSession.findUnique({
      where: { id: sessionIdToRevoke },
    });

    if (!session || session.userId !== userId) {
      throw new NotFoundException('Session not found');
    }

    if (session.revokedAt !== null) {
      return {
        success: true,
        message: 'Session is already revoked',
        isCurrent: sessionIdToRevoke === currentSessionId,
      };
    }

    await this.prisma.userSession.update({
      where: { id: sessionIdToRevoke },
      data: {
        revokedAt: new Date(),
        revokedReason: 'USER_REVOKED',
      },
    });

    forgetSessions();
    await this.cacheHelper.invalidateNamespace(`auth_user:${userId}`);

    if (typeof (this.prisma as any).logAction === 'function') {
      await (this.prisma as any).logAction({
        actorId: userId,
        action: 'REVOKE_SESSION',
        entity: 'UserSession',
        entityId: sessionIdToRevoke,
        meta: { reason: 'Specific user session revoked' },
      }).catch(() => {});
    }

    return {
      success: true,
      message: 'Session revoked successfully',
      isCurrent: sessionIdToRevoke === currentSessionId,
    };
  }

  /**
   * Password Reset Request (D1-021): Generates secure token, stores token hash with 1h expiry.
   * Generic response prevents account enumeration.
   */
  async requestPasswordReset(email: string) {
    const genericResponse = {
      message: 'If an account with that email exists, a password reset link has been sent.',
    };

    const trimmedEmail = email?.trim();
    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      return genericResponse;
    }

    const normalizedEmail = trimmedEmail.toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user || user.deletedAt) {
      return genericResponse;
    }

    // Generate cryptographically secure random token (256-bit entropy)
    const rawToken = randomBytes(32).toString('hex');
    // Store only SHA-256 hash in DB; never persist raw token
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour expiry

    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        token: tokenHash,
        expiresAt,
      },
    });

    const orgMembership = this.prisma.organizationMember
      ? await this.prisma.organizationMember.findFirst({
          where: { userId: user.id },
        })
      : null;
    const isStaffOrOrg = Boolean(
      orgMembership ||
      user.role === Role.SUPER_ADMIN ||
      user.role === Role.ADMIN ||
      user.role === Role.MANAGER ||
      user.role === Role.TEACHER,
    );
    const { adminUrl, lmsUrl } = getAppUrls();
    const baseUrl = isStaffOrOrg ? adminUrl : lmsUrl;
    const resetUrl = `${baseUrl}/reset-password?token=${rawToken}&email=${encodeURIComponent(user.email)}`;

    if (this.emailService) {
      const firstName = user.name ? (user.name.split(' ')[0] || user.name) : (orgMembership ? 'Partner' : 'Learner');
      this.emailService
        .sendTemplateEmail({
          to: user.email,
          subject: 'Reset your password - WhatBoutMe',
          template: 'PasswordResetEmail',
          props: {
            firstName,
            resetUrl,
          },
        })
        .catch((e: any) => console.warn('[AuthService] Password reset email error:', e?.message));
    }

    return genericResponse;
  }

  /**
   * Password Reset Verify Token: Validates token without consuming it,
   * returning whether it is valid and the associated user's email and name.
   */
  async verifyPasswordResetToken(token: string) {
    if (!token || typeof token !== 'string' || !token.trim()) {
      return { valid: false, error: 'Reset token is missing or malformed.' };
    }

    const tokenHash = createHash('sha256').update(token.trim()).digest('hex');
    const resetToken = await this.prisma.passwordResetToken.findUnique({
      where: { token: tokenHash },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            deletedAt: true,
          },
        },
      },
    });

    if (!resetToken) {
      return { valid: false, error: 'Invalid or unknown reset link.' };
    }

    if (resetToken.usedAt !== null) {
      return {
        valid: false,
        used: true,
        email: resetToken.user?.email || null,
        error: 'This password setup link has already been used. Please request a new one.',
      };
    }

    if (resetToken.expiresAt <= new Date()) {
      return {
        valid: false,
        expired: true,
        email: resetToken.user?.email || null,
        error: 'This password setup link has expired. Please request a new one.',
      };
    }

    if (!resetToken.user || resetToken.user.deletedAt !== null) {
      return { valid: false, error: 'Associated user account could not be found.' };
    }

    return {
      valid: true,
      email: resetToken.user.email,
      name: resetToken.user.name,
    };
  }

  /**
   * Password Reset Confirm (D1-021): Validates token hash, updates password,
   * consumes token, invalidates prior tokens, revokes all sessions, and clears session cache.
   */
  async confirmPasswordReset(token: string, newPassword: string) {
    if (!token || typeof token !== 'string' || !token.trim()) {
      throw new BadRequestException('Invalid or expired password reset token');
    }

    if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 8) {
      throw new BadRequestException('New password must be at least 8 characters long');
    }

    const tokenHash = createHash('sha256').update(token.trim()).digest('hex');

    const resetToken = await this.prisma.passwordResetToken.findUnique({
      where: { token: tokenHash },
      include: { user: true },
    });

    if (
      !resetToken ||
      resetToken.usedAt !== null ||
      resetToken.expiresAt <= new Date() ||
      !resetToken.user ||
      resetToken.user.deletedAt !== null
    ) {
      throw new BadRequestException('Invalid or expired password reset token');
    }

    const newPasswordHash = await bcrypt.hash(newPassword, 12);
    const now = new Date();

    // Atomic transaction: lock on userId, re-verify unused state, update password, consume token,
    // invalidate all other tokens for this user, and revoke all active sessions.
    await this.prisma.$transaction(async (tx: any) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${resetToken.userId}))`;

      // Re-fetch token under advisory lock to prevent race condition / duplicate resets
      const currentToken = await tx.passwordResetToken.findUnique({
        where: { id: resetToken.id },
      });

      if (!currentToken || currentToken.usedAt !== null || currentToken.expiresAt <= now) {
        throw new BadRequestException('Invalid or expired password reset token');
      }

      // 1. Update password
      await tx.user.update({
        where: { id: resetToken.userId },
        data: { passwordHash: newPasswordHash },
      });

      // 2. Mark this token as used
      await tx.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { usedAt: now },
      });

      // 3. Invalidate any other active reset tokens for this user
      await tx.passwordResetToken.updateMany({
        where: {
          userId: resetToken.userId,
          usedAt: null,
        },
        data: { usedAt: now },
      });

      // 4. Revoke all active sessions for this user
      await tx.userSession.updateMany({
        where: {
          userId: resetToken.userId,
          revokedAt: null,
        },
        data: {
          revokedAt: now,
          revokedReason: 'PASSWORD_RESET',
        },
      });
    });

    // Invalidate local in-memory session cache so any in-flight access JWTs for these sessions
    // immediately fail revocation check in D1-019
    forgetSessions();
    try {
      await this.cacheHelper?.invalidateNamespace(`auth_user:${resetToken.userId}`);
      await this.cacheHelper?.del(`auth_user:${resetToken.userId}`);
    } catch {
      // Non-blocking cache cleanup fallback
    }

    if (typeof (this.prisma as any).logAction === 'function') {
      await (this.prisma as any).logAction({
        actorId: resetToken.userId,
        action: 'PASSWORD_RESET',
        entity: 'User',
        entityId: resetToken.userId,
        meta: { reason: 'Password reset confirmed via token' },
      }).catch(() => {});
    }

    return {
      success: true,
      message: 'Password has been reset successfully',
    };
  }

  /**
   * Generate 2FA Secret (D1-022): Generates TOTP secret and otpauth URI for SUPER_ADMIN or ADMIN.
   * Does NOT enable 2FA until verified.
   */
  async generate2faSecret(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || user.deletedAt) {
      throw new UnauthorizedException('User not found');
    }

    if (user.role !== Role.SUPER_ADMIN && user.role !== Role.ADMIN) {
      throw new ForbiddenException('Two-factor authentication is only available for admin roles');
    }

    const secret = generateTotpSecret();
    const otpauthUrl = generateOtpauthUri({
      issuer: 'WhatBoutMe',
      accountName: user.email,
      secret,
    });

    return {
      secret,
      otpauthUrl,
    };
  }

  /**
   * Enable 2FA (D1-022): Verifies TOTP code against setup secret, encrypts secret at rest with AES-256-GCM,
   * generates 10 hashed backup codes, and enables twoFactorEnabled.
   */
  async enable2fa(userId: string, code: string, secret?: string) {
    if (!code || typeof code !== 'string') {
      throw new BadRequestException('Verification code is required');
    }

    if (!secret || typeof secret !== 'string' || !/^[A-Z2-7]{16,64}$/i.test(secret.trim())) {
      throw new BadRequestException('Setup secret is required and must be a valid Base32 string (16-64 characters)');
    }

    const trimmedSecret = secret.trim().toUpperCase();

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || user.deletedAt) {
      throw new UnauthorizedException('User not found');
    }

    if (user.role !== Role.SUPER_ADMIN && user.role !== Role.ADMIN) {
      throw new ForbiddenException('Two-factor authentication is only available for admin roles');
    }

    const isValid = verifyTotp(code, trimmedSecret, { window: 2 });
    if (!isValid) {
      throw new BadRequestException('Invalid verification code');
    }

    const rawBackupCodes = generateBackupCodes(10);
    const hashedBackupCodes = rawBackupCodes.map(hashBackupCode);
    const encryptedSecret = encryptTotpSecret(trimmedSecret);

    // Atomically persist under advisory lock
    await this.prisma.$transaction(async (tx: any) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`;

      await tx.user.update({
        where: { id: userId },
        data: {
          twoFactorSecret: encryptedSecret,
          twoFactorEnabled: true,
          twoFactorBackupCodes: hashedBackupCodes,
        },
      });
    });

    return {
      success: true,
      message: 'Two-factor authentication enabled successfully',
      backupCodes: rawBackupCodes,
    };
  }

  /**
   * Verify 2FA (D1-022): Verifies TOTP or backup code during admin login handshake,
   * creates UserSession with device limit, and issues access + refresh tokens.
   */
  async verify2fa(tempToken: string, code: string, metadata?: DeviceSessionMetadata) {
    if (!tempToken || typeof tempToken !== 'string') {
      throw new UnauthorizedException('Two-factor authentication token is required');
    }

    if (!code || typeof code !== 'string') {
      throw new UnauthorizedException('Verification code is required');
    }

    let payload: any;
    try {
      payload = this.jwtService.verify(tempToken, {
        secret: process.env.JWT_SECRET || 'fallback-secret',
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired two-factor authentication session');
    }

    if (!payload || !payload.sub || payload.purpose !== '2fa_login') {
      throw new UnauthorizedException('Invalid or expired two-factor authentication session');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });

    if (!user || user.deletedAt || !user.twoFactorEnabled || !user.twoFactorSecret) {
      if (user) {
        await this.recordLoginAudit({
          userId: user.id,
          ipAddress: metadata?.ipAddress,
          userAgent: metadata?.userAgent,
          country: metadata?.country,
          deviceFingerprint: metadata?.deviceFingerprint,
          isSuspicious: true,
          reason: '2FA_NOT_ACTIVE',
          userCountry: user.country,
        });
      }
      throw new UnauthorizedException('Two-factor authentication is not active for this account');
    }

    if (user.role !== Role.SUPER_ADMIN && user.role !== Role.ADMIN) {
      await this.recordLoginAudit({
        userId: user.id,
        ipAddress: metadata?.ipAddress,
        userAgent: metadata?.userAgent,
        country: metadata?.country,
        deviceFingerprint: metadata?.deviceFingerprint,
        isSuspicious: true,
        reason: 'INSUFFICIENT_PERMISSIONS',
        userCountry: user.country,
      });
      throw new ForbiddenException('Two-factor authentication is only available for admin roles');
    }

    const trimmedCode = code.trim().toUpperCase();

    // 1. Try TOTP code verification
    let verified = false;

    try {
      const decryptedSecret = decryptTotpSecret(user.twoFactorSecret);
      if (verifyTotp(trimmedCode, decryptedSecret, { window: 2 })) {
        verified = true;
      }
    } catch {
      await this.recordLoginAudit({
        userId: user.id,
        ipAddress: metadata?.ipAddress,
        userAgent: metadata?.userAgent,
        country: metadata?.country,
        deviceFingerprint: metadata?.deviceFingerprint,
        isSuspicious: true,
        reason: 'INVALID_2FA_CODE',
        userCountry: user.country,
      });
      throw new UnauthorizedException('Two-factor authentication verification failed');
    }

    // 2. If TOTP failed, try backup code verification under transactional advisory lock
    if (!verified) {
      const candidateHash = hashBackupCode(trimmedCode);

      try {
        await this.prisma.$transaction(async (tx: any) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${user.id}))`;

          const freshUser = await tx.user.findUnique({
            where: { id: user.id },
          });

          if (
            !freshUser ||
            freshUser.deletedAt ||
            !freshUser.twoFactorEnabled ||
            !freshUser.twoFactorBackupCodes ||
            freshUser.twoFactorBackupCodes.length === 0
          ) {
            return;
          }

          const usedIdx = freshUser.twoFactorBackupCodes.indexOf(candidateHash);
          if (usedIdx === -1) {
            return;
          }

          const remainingBackupCodes = freshUser.twoFactorBackupCodes.filter(
            (_: string, idx: number) => idx !== usedIdx,
          );

          await tx.user.update({
            where: { id: freshUser.id },
            data: { twoFactorBackupCodes: remainingBackupCodes },
          });

          verified = true;
        });
      } catch {
        // Any transaction failure leaves verified as false
      }
    }

    if (!verified) {
      await this.recordLoginAudit({
        userId: user.id,
        ipAddress: metadata?.ipAddress,
        userAgent: metadata?.userAgent,
        country: metadata?.country,
        deviceFingerprint: metadata?.deviceFingerprint,
        isSuspicious: true,
        reason: 'INVALID_2FA_CODE',
        userCountry: user.country,
      });
      throw new UnauthorizedException('Invalid two-factor authentication code');
    }

    // 3. Issue full session tokens with D1-017 limits and D1-018 rotation
    const sessionId = randomUUID();
    const refreshPayload = { sub: user.id, sessionId };
    const refreshToken = this.jwtService.sign(refreshPayload, {
      secret: process.env.JWT_REFRESH_SECRET || 'fallback-refresh-secret',
      expiresIn: '7d',
    });
    const tokenHash = await bcrypt.hash(refreshToken, 10);

    await this.createDeviceSession(user.id, user.role, tokenHash, metadata, sessionId);

    const accessPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      permissions: Array.from(new Set([
        ...(user.permissions || []),
        ...getRolePermissions(user.role)
      ])),
      companyId: user.companyId,
      sessionId,
    };

    const accessToken = this.jwtService.sign(accessPayload, { expiresIn: '15m' });

    await this.recordLoginAudit({
      userId: user.id,
      ipAddress: metadata?.ipAddress,
      userAgent: metadata?.userAgent,
      country: metadata?.country,
      deviceFingerprint: metadata?.deviceFingerprint,
      isSuspicious: false,
      reason: '2FA_SUCCESS',
      userCountry: user.country,
    });

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        permissions: Array.from(new Set([
          ...(user.permissions || []),
          ...getRolePermissions(user.role)
        ])),
      },
    };
  }

  /**
   * Send One-Time Password (OTP) via Email
   */
  async sendEmailOtp(email: string) {
    const normalizedEmail = email?.trim()?.toLowerCase();
    if (!normalizedEmail || !normalizedEmail.includes('@')) {
      throw new BadRequestException('Valid email is required');
    }

    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    // Generate 6-digit OTP
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 10 * 60 * 1000;

    await this.saveOtpRecord(normalizedEmail, {
      code: otpCode,
      expiresAt,
      attempts: 0,
    });

    if (user && this.prisma.otpCode) {
      await this.prisma.otpCode.create({
        data: {
          userId: user.id,
          code: otpCode,
          expiresAt: new Date(expiresAt),
        },
      }).catch((e: any) => console.warn('[AuthService] DB OtpCode create warning:', e?.message));
    }

    if (this.emailService) {
      const firstName = user?.name ? (user.name.split(' ')[0] || user.name) : 'Learner';
      await this.emailService
        .sendTemplateEmail({
          to: normalizedEmail,
          subject: `Your WhatBoutMe security code is ${otpCode}`,
          template: 'OneTimeOtpEmail',
          props: {
            firstName,
            otpCode,
          },
        })
        .catch((e: any) => console.warn('[AuthService] OTP email error:', e?.message));
    }

    return { success: true, message: 'OTP sent successfully to email' };
  }

  /**
   * Verify One-Time Password (OTP) from Email
   */
  async verifyEmailOtp(email: string, code: string) {
    const normalizedEmail = email?.trim()?.toLowerCase();
    const trimmedCode = code?.trim();
    if (!normalizedEmail || !trimmedCode) {
      throw new BadRequestException('Email and OTP code are required');
    }

    const cached = await this.getOtpRecord(normalizedEmail);

    if (!cached || cached.expiresAt < Date.now()) {
      throw new BadRequestException('Invalid or expired OTP code');
    }

    if (cached.attempts >= 5) {
      await this.clearOtpRecord(normalizedEmail);
      throw new BadRequestException('Too many failed attempts. Please request a new code.');
    }

    if (cached.code !== trimmedCode) {
      cached.attempts += 1;
      await this.saveOtpRecord(normalizedEmail, cached);
      throw new BadRequestException('Invalid or expired OTP code');
    }

    // Invalidate OTP after successful verification
    await this.clearOtpRecord(normalizedEmail);

    // If user exists, mark DB record as used
    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true },
    });
    if (user && this.prisma.otpCode) {
      await this.prisma.otpCode.updateMany({
        where: { userId: user.id, code: trimmedCode, usedAt: null },
        data: { usedAt: new Date() },
      }).catch(() => null);
    }

    return { success: true, message: 'OTP verified successfully' };
  }

  /**
   * Send One-Time Password (OTP) for Learner Signup via Email
   */
  async sendSignupOtp(email: string, name?: string, rawPhone?: string) {
    const normalizedEmail = email?.trim()?.toLowerCase();
    if (!normalizedEmail || !normalizedEmail.includes('@')) {
      throw new BadRequestException('Valid email is required');
    }

    const existing = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    if (rawPhone?.trim()) {
      const phone = this.normalizePhone(rawPhone);
      const phoneTaken = await this.prisma.user.findFirst({
        where: { phone, deletedAt: null },
      });
      if (phoneTaken) {
        throw new ConflictException('An account with this mobile number already exists');
      }
    }

    // Generate 6-digit OTP
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 10 * 60 * 1000;

    await this.saveOtpRecord(normalizedEmail, {
      code: otpCode,
      expiresAt,
      attempts: 0,
    });

    if (this.emailService) {
      const firstName = name?.trim() ? (name.trim().split(' ')[0] || name.trim()) : 'Learner';
      await this.emailService
        .sendTemplateEmail({
          to: normalizedEmail,
          subject: `Your WhatBoutMe security code is ${otpCode}`,
          template: 'OneTimeOtpEmail',
          props: {
            firstName,
            otpCode,
          },
        })
        .catch((e: any) => console.warn('[AuthService] Signup OTP email error:', e?.message));
    }

    return { success: true, message: 'Verification code sent to your email' };
  }
}

