import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from './jwt.strategy.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { forgetSessions, sessionKnownLive } from '../../common/session-cache.js';

describe('JwtStrategy - Access Token Revocation & Session Enforcement (D1-019)', () => {
  let strategy: JwtStrategy;
  let prismaMock: {
    userSession: {
      findUnique: ReturnType<typeof vi.fn>;
    };
  };

  const validPayload = {
    sub: 'user-jwt-1',
    email: 'jwt@example.com',
    role: 'USER',
    companyId: 'company-1',
    sessionId: 'sess-active-1',
  };

  beforeEach(() => {
    forgetSessions();
    prismaMock = {
      userSession: {
        findUnique: vi.fn(),
      },
    };
    strategy = new JwtStrategy(prismaMock as unknown as PrismaService);
  });

  it('1. Authenticates valid access JWT when bound UserSession is active', async () => {
    prismaMock.userSession.findUnique.mockResolvedValue({
      id: 'sess-active-1',
      userId: 'user-jwt-1',
      revokedAt: null,
      expiresAt: new Date(Date.now() + 1000000),
    });

    const user = await strategy.validate(validPayload);

    expect(user).toEqual({
      sub: 'user-jwt-1',
      userId: 'user-jwt-1',
      email: 'jwt@example.com',
      role: 'USER',
      companyId: 'company-1',
      sessionId: 'sess-active-1',
    });
    expect(prismaMock.userSession.findUnique).toHaveBeenCalledWith({
      where: { id: 'sess-active-1' },
    });
  });

  it('2. Rejects request with 401 when UserSession is revoked', async () => {
    prismaMock.userSession.findUnique.mockResolvedValue({
      id: 'sess-active-1',
      userId: 'user-jwt-1',
      revokedAt: new Date(),
      revokedReason: 'DEVICE_LIMIT_EXCEEDED',
      expiresAt: new Date(Date.now() + 1000000),
    });

    await expect(strategy.validate(validPayload)).rejects.toThrow(UnauthorizedException);
  });

  it('3. Rejects request with 401 when UserSession is expired in the past', async () => {
    prismaMock.userSession.findUnique.mockResolvedValue({
      id: 'sess-active-1',
      userId: 'user-jwt-1',
      revokedAt: null,
      expiresAt: new Date(Date.now() - 5000), // in the past
    });

    await expect(strategy.validate(validPayload)).rejects.toThrow(UnauthorizedException);
  });

  it('4. Rejects request with 401 when UserSession row is missing from database', async () => {
    prismaMock.userSession.findUnique.mockResolvedValue(null);

    await expect(strategy.validate(validPayload)).rejects.toThrow(UnauthorizedException);
  });

  it('5. Rejects request with 401 when JWT payload lacks sessionId', async () => {
    const payloadWithoutSession = {
      sub: 'user-jwt-1',
      email: 'jwt@example.com',
      role: 'USER',
      companyId: 'company-1',
    };

    await expect(strategy.validate(payloadWithoutSession)).rejects.toThrow(UnauthorizedException);
    expect(prismaMock.userSession.findUnique).not.toHaveBeenCalled();
  });

  it('6. Rejects request with 401 when JWT payload lacks sub (user identifier)', async () => {
    const payloadWithoutSub = {
      email: 'jwt@example.com',
      role: 'USER',
      companyId: 'company-1',
      sessionId: 'sess-active-1',
    };

    await expect(strategy.validate(payloadWithoutSub)).rejects.toThrow(UnauthorizedException);
    expect(prismaMock.userSession.findUnique).not.toHaveBeenCalled();
  });

  it('7. Rejects request with 401 when session belongs to a different user than JWT sub', async () => {
    prismaMock.userSession.findUnique.mockResolvedValue({
      id: 'sess-active-1',
      userId: 'user-different', // Mismatch!
      revokedAt: null,
      expiresAt: new Date(Date.now() + 1000000),
    });

    await expect(strategy.validate(validPayload)).rejects.toThrow(UnauthorizedException);
  });

  it('8. Uses session cache on subsequent requests and invalidates immediately on forgetSessions()', async () => {
    prismaMock.userSession.findUnique.mockResolvedValue({
      id: 'sess-active-1',
      userId: 'user-jwt-1',
      revokedAt: null,
      expiresAt: new Date(Date.now() + 1000000),
    });

    // Request 1: hits database and caches session
    await strategy.validate(validPayload);
    expect(prismaMock.userSession.findUnique).toHaveBeenCalledTimes(1);

    // Request 2: serves from cache without hitting database
    await strategy.validate(validPayload);
    expect(prismaMock.userSession.findUnique).toHaveBeenCalledTimes(1);

    // Revocation event: clears cache
    forgetSessions();
    expect(sessionKnownLive('sess-active-1', 'user-jwt-1')).toBe(false);

    // Database row now shows revoked
    prismaMock.userSession.findUnique.mockResolvedValue({
      id: 'sess-active-1',
      userId: 'user-jwt-1',
      revokedAt: new Date(),
      expiresAt: new Date(Date.now() + 1000000),
    });

    // Request 3: must hit database and fail with 401
    await expect(strategy.validate(validPayload)).rejects.toThrow(UnauthorizedException);
    expect(prismaMock.userSession.findUnique).toHaveBeenCalledTimes(2);
  });

  it('9. Prevents cross-user cache spoofing when another user presents the same active sessionId', async () => {
    prismaMock.userSession.findUnique.mockResolvedValue({
      id: 'sess-active-1',
      userId: 'user-jwt-1',
      revokedAt: null,
      expiresAt: new Date(Date.now() + 1000000),
    });

    // User 1 validates and caches session
    await strategy.validate(validPayload);
    expect(prismaMock.userSession.findUnique).toHaveBeenCalledTimes(1);

    // Attacker (User 2) presents the same sessionId with their own sub
    const spoofPayload = {
      ...validPayload,
      sub: 'attacker-user-2',
    };

    // Cache must NOT bypass database lookup for a different sub
    prismaMock.userSession.findUnique.mockClear();
    prismaMock.userSession.findUnique.mockResolvedValue({
      id: 'sess-active-1',
      userId: 'user-jwt-1', // belongs to user-jwt-1, not attacker
      revokedAt: null,
      expiresAt: new Date(Date.now() + 1000000),
    });

    await expect(strategy.validate(spoofPayload)).rejects.toThrow(UnauthorizedException);
    expect(prismaMock.userSession.findUnique).toHaveBeenCalledTimes(1);
  });
});
