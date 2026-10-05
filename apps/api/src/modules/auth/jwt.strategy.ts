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
    if (payload.sessionId && !sessionKnownLive(payload.sessionId)) {
      const session = await this.prisma.userSession.findUnique({
        where: { id: payload.sessionId }
      });
      // A revoked row still exists, so checking for the row alone let an
      // ended session keep working until its access token expired.
      if (!session || session.revokedAt) {
        throw new UnauthorizedException({ message: 'Session has been revoked', error: 'SESSION_REVOKED' });
      }
      rememberLiveSession(payload.sessionId);
      
      // Optionally update lastActive here (may cause many DB writes, usually skipped or debounced)
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
