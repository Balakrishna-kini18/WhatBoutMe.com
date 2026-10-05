import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service.js';
import { UnauthorizedException } from '@nestjs/common';
import { rememberLiveSession, sessionKnownLive } from '../../common/session-cache.js';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'fallback-secret',
    });
  }

  async validate(payload: any) {
    // Every authenticated API request using an access JWT must verify that the JWT's bound UserSession is still valid.
    if (!payload || !payload.sub || !payload.sessionId) {
      throw new UnauthorizedException({ message: 'Session has been revoked', error: 'SESSION_REVOKED' });
    }

    if (!sessionKnownLive(payload.sessionId, payload.sub)) {
      const session = await this.prisma.userSession.findUnique({
        where: { id: payload.sessionId },
      });

      // Verify session exists, belongs to JWT subject/user, and is neither revoked nor expired
      if (
        !session ||
        session.userId !== payload.sub ||
        session.revokedAt !== null ||
        (session.expiresAt && session.expiresAt <= new Date())
      ) {
        throw new UnauthorizedException({ message: 'Session has been revoked', error: 'SESSION_REVOKED' });
      }

      rememberLiveSession(payload.sessionId, session.userId, session.expiresAt);
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
