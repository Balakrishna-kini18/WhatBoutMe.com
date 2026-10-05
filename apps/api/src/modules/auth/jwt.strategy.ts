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
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'fallback-secret',
    });
  }

  async validate(payload: any) {
    if (payload.sessionId) {
      const guardKey = await this.cacheHelper.getGuardKey(payload.sub, payload.sessionId);
      
      const isSessionValid = await this.cacheHelper.getOrSet(
        guardKey,
        async () => {
          const session = await this.prisma.userSession.findUnique({
            where: { id: payload.sessionId }
          });
          if (!session || session.revokedAt) {
            return false;
          }
          return true;
        },
        900 // 15 mins cache for session validity
      );

      if (!isSessionValid) {
        throw new UnauthorizedException({ message: 'Session has been revoked', error: 'SESSION_REVOKED' });
      }
    }

    // This decoded payload is attached to req.user
    return {
      sub: payload.sub,
      userId: payload.sub, // mapping sub to userId for some controllers
      email: payload.email,
      role: payload.role,
      companyId: payload.companyId,
      sessionId: payload.sessionId,
    };
  }
}
