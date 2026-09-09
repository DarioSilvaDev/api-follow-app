import { UnauthorizedException } from '@nestjs/common';
import { RefreshTokenHandler } from './refresh-token.handler';
import { RefreshTokenCommand } from './refresh-token.command';

// Mock envs before the handler imports it, to avoid Joi validation failure
// (same pattern as login.handler.spec). The handler reads only
// JWT_ACCESS_EXPIRES_IN for the explicit signing exp (Wave P2 — B1).
jest.mock('../../../../config/envs', () => ({
  envs: { JWT_ACCESS_EXPIRES_IN: '1500' },
}));

describe('RefreshTokenHandler — atomic rotation (TOCTOU, Security Review #3)', () => {
  let handler: RefreshTokenHandler;
  let authRepository: any;
  let jwtService: any;
  let prisma: any;
  let tx: any;

  beforeEach(() => {
    authRepository = { createSession: jest.fn().mockResolvedValue({}) };
    jwtService = { sign: jest.fn().mockReturnValue('signed-token') };
    prisma = {
      $transaction: jest.fn(async (cb: (t: any) => unknown) => cb(tx)),
      userSession: {
        findFirst: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      impersonationSession: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    tx = {
      userSession: {
        findFirst: jest.fn(),
        updateMany: jest.fn(),
      },
    };
    handler = new RefreshTokenHandler(
      authRepository as any,
      jwtService as any,
      prisma as any,
    );
  });

  function session(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      id: 'session-1',
      userId: 'user-1',
      refreshTokenHash: 'hash',
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      ...overrides,
    };
  }

  it('issues a new refresh session when the token is valid and unrevolved (winner)', async () => {
    tx.userSession.findFirst.mockResolvedValue(session());
    tx.userSession.updateMany.mockResolvedValue({ count: 1 });

    const result = await handler.execute(new RefreshTokenCommand('tok'), 'ip');

    // Atomic rotate was applied to the specific session row (compare-and-swap).
    expect(tx.userSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ revokedAt: null }),
        data: expect.objectContaining({ revokedAt: expect.any(Date) }),
      }),
    );
    expect(authRepository.createSession).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ impersonated: false });
    expect(result.accessToken).toBe('signed-token');
  });

  it('detects reuse when the token was already revoked and revokes all user sessions', async () => {
    tx.userSession.findFirst.mockResolvedValue(
      session({ revokedAt: new Date() }),
    );

    await expect(
      handler.execute(new RefreshTokenCommand('tok'), 'ip'),
    ).rejects.toThrow(UnauthorizedException);

    // Compromise detection persists OUTSIDE the transaction (revokes all sessions).
    expect(prisma.userSession.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(authRepository.createSession).not.toHaveBeenCalled();
  });

  it('detects reuse when the rotation race is lost (concurrent winner took the row)', async () => {
    // First read saw it unrevolved, but the conditional update matched 0 rows
    // because a concurrent call already rotated it.
    tx.userSession.findFirst.mockResolvedValue(session());
    tx.userSession.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      handler.execute(new RefreshTokenCommand('tok'), 'ip'),
    ).rejects.toThrow(UnauthorizedException);
    expect(prisma.userSession.updateMany).toHaveBeenCalled();
    expect(authRepository.createSession).not.toHaveBeenCalled();
  });

  it('throws invalid when the token is not found', async () => {
    tx.userSession.findFirst.mockResolvedValue(null);

    await expect(
      handler.execute(new RefreshTokenCommand('tok'), 'ip'),
    ).rejects.toThrow(UnauthorizedException);
    expect(authRepository.createSession).not.toHaveBeenCalled();
  });

  it('throws invalid when the token is expired (even though unrevolved)', async () => {
    tx.userSession.findFirst.mockResolvedValue(
      session({ expiresAt: new Date(Date.now() - 1000) }),
    );
    tx.userSession.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      handler.execute(new RefreshTokenCommand('tok'), 'ip'),
    ).rejects.toThrow(UnauthorizedException);
    expect(authRepository.createSession).not.toHaveBeenCalled();
  });
});
