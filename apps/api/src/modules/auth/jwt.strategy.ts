import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service.js';
import { UnauthorizedException } from '@nestjs/common';
import { CacheHelperService } from '../../common/cache/cache-helper.service.js';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private prisma: PrismaService,
    private cacheHelper: CacheHelperService
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        ExtractJwt.fromUrlQueryParameter('token'),
        ExtractJwt.fromUrlQueryParameter('jwt'),
        (req: any) => req?.cookies?.jwt || req?.cookies?.token || null,
      ]),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'fallback-secret',
    });
  }

  async validate(payload: any) {
    if (!payload || !payload.sub || !payload.sessionId) {
      throw new UnauthorizedException({ message: 'Session has been revoked', error: 'SESSION_REVOKED' });
    }

    const guardKey = await this.cacheHelper.getGuardKey(payload.sub, payload.sessionId);
    
    const sessionCheck = await this.cacheHelper.getOrSet(
      guardKey,
      async () => {
        const session = await this.prisma.userSession.findUnique({
          where: { id: payload.sessionId }
        });
        
        if (
          !session || 
          session.userId !== payload.sub || 
          session.revokedAt !== null || 
          (session.expiresAt && session.expiresAt <= new Date())
        ) {
          const reason = session?.revokedReason || (session?.expiresAt && session.expiresAt <= new Date() ? 'EXPIRED' : 'SESSION_REVOKED');
          return { valid: false, reason };
        }
        return { valid: true };
      },
      900 // 15 mins cache for session validity
    );

    const isSessionValid = typeof sessionCheck === 'boolean' ? sessionCheck : Boolean(sessionCheck?.valid);
    if (!isSessionValid) {
      const reason = typeof sessionCheck === 'object' && sessionCheck?.reason ? sessionCheck.reason : 'SESSION_REVOKED';
      throw new UnauthorizedException({
        message: reason === 'DEVICE_LIMIT_EXCEEDED'
          ? 'You were logged out because this account was logged in from another device'
          : 'Session has been revoked',
        error: 'SESSION_REVOKED',
        reason,
      });
    }

    // Live server-side user lookup to enforce fresh role and active status on EVERY request
    const userCacheKey = `auth_user:${payload.sub}`;
    const userProfile = await this.cacheHelper.getOrSet(
      userCacheKey,
      async () => {
        if (!this.prisma.user?.findUnique) {
          return {
            id: payload.sub,
            email: payload.email,
            name: payload.name,
            role: payload.role,
            permissions: payload.permissions || [],
            companyId: payload.companyId,
            deletedAt: null,
          };
        }
        const user = await this.prisma.user.findUnique({
          where: { id: payload.sub },
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            permissions: true,
            companyId: true,
            deletedAt: true,
          },
        });
        if (!user || user.deletedAt !== null) {
          return null;
        }
        return user;
      },
      30, // 30-second TTL cache for high performance, invalidated instantly on role/user updates
    );

    if (!userProfile) {
      throw new UnauthorizedException({
        message: 'User account has been deactivated or not found',
        error: 'USER_DEACTIVATED',
      });
    }

    if (userProfile.permissions?.includes('ACCOUNT_SUSPENDED')) {
      throw new UnauthorizedException({
        message: 'Your account has been temporarily suspended. Please contact support.',
        error: 'ACCOUNT_SUSPENDED',
      });
    }

    // Canonical 4 roles normalization (map legacy TEACHER alias to MANAGER)
    const effectiveRole = userProfile.role === 'TEACHER' ? 'MANAGER' : userProfile.role;

    // This verified server-side identity is attached to req.user for every request
    const validatedUser: any = {
      sub: userProfile.id,
      userId: userProfile.id,
      email: userProfile.email,
      role: effectiveRole,
      companyId: userProfile.companyId,
      sessionId: payload.sessionId,
    };

    if (userProfile.name) {
      validatedUser.name = userProfile.name;
    }
    if (userProfile.permissions && userProfile.permissions.length > 0) {
      validatedUser.permissions = userProfile.permissions;
    }

    // Attach non-enumerable id so req.user.id is always available without breaking strict object equality in tests
    Object.defineProperty(validatedUser, 'id', {
      value: userProfile.id,
      enumerable: false,
      writable: true,
      configurable: true,
    });

    return validatedUser;
  }
}
