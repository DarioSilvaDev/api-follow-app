import { JwtStrategy } from './jwt.strategy';
import { PrismaService } from '../../../common/database/prisma.service';
import {
  ImpersonationExpiredException,
  SessionExpiredException,
} from '../../../common/exceptions/coded.exception';
import { ERROR_CODES } from '../../../common/exceptions/error-codes';

// Mock envs before the strategy imports it, to avoid Joi validation failure
// (JWT_REFRESH_SECRET and friends live in the developer shell, not in .env —
// same pattern as login.handler.spec).
jest.mock('../../../config/envs', () => ({
  envs: { JWT_SECRET: 'test-secret' },
}));

/**
 * Unit tests for the REAL JwtStrategy — D-016 A1.
 *
 * Round 3 note: the previous version of this spec re-implemented the strategy's
 * expiration logic in a local validatePayload() helper, so the tests proved
 * nothing about the actual strategy. These tests instantiate the real
 * JwtStrategy (which registers itself via passport.use('jwt', ...); safe under
 * jest) and exercise validate() directly, including the Prisma lookup.
 *
 * import of envs (transitively via jwt.strategy.ts) triggers dotenv.config(),
 * so the real JWT_SECRET from .env is used — same as at runtime.
 */
describe('JwtStrategy — D-016 A1 impersonation expiration (real strategy)', () => {
  let strategy: JwtStrategy;
  let prismaMock: {
    user: {
      findUnique: jest.Mock;
    };
  };

  const nowEpochSeconds = () => Math.floor(Date.now() / 1000);

  beforeEach(() => {
    prismaMock = {
      user: {
        findUnique: jest.fn(),
      },
    };
    strategy = new JwtStrategy(prismaMock as unknown as PrismaService);
  });

  // ── Expiration behavior (ignoreExpiration: true, manual exp check) ──

  it('throws ImpersonationExpiredException when exp is past and impersonated is true', async () => {
    const pastEpoch = nowEpochSeconds() - 3600;
    await expect(
      strategy.validate({ sub: 'user-1', impersonated: true, exp: pastEpoch }),
    ).rejects.toBeInstanceOf(ImpersonationExpiredException);
    // DB lookup must NOT run: expiration check happens before it
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });

  it('throws SessionExpiredException when exp is past and impersonated is false', async () => {
    const pastEpoch = nowEpochSeconds() - 3600;
    await expect(
      strategy.validate({ sub: 'user-1', impersonated: false, exp: pastEpoch }),
    ).rejects.toBeInstanceOf(SessionExpiredException);
  });

  it('throws SessionExpiredException when exp is past and impersonated is undefined', async () => {
    const pastEpoch = nowEpochSeconds() - 3600;
    await expect(
      strategy.validate({ sub: 'user-1', exp: pastEpoch }),
    ).rejects.toBeInstanceOf(SessionExpiredException);
  });

  it('throws ImpersonationExpiredException with code IMPERSONATION_EXPIRED', async () => {
    const pastEpoch = nowEpochSeconds() - 3600;
    try {
      await strategy.validate({
        sub: 'user-1',
        impersonated: true,
        exp: pastEpoch,
      });
      fail('expected ImpersonationExpiredException');
    } catch (error) {
      // CodedHttpException keeps `code` in the HTTP response body, exposed
      // via getCode() — not as a direct property on the error instance.
      expect((error as ImpersonationExpiredException).getCode()).toBe(
        ERROR_CODES.IMPERSONATION_EXPIRED,
      );
    }
  });

  // ── Valid expiration: user lookup runs and user state is enforced ──

  it('resolves with the found active user (unimpersonated)', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'owner@example.com',
      status: 'active',
    });

    const futureEpoch = nowEpochSeconds() + 3600;
    const result = await strategy.validate({
      sub: 'user-1',
      exp: futureEpoch,
    });

    expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      select: { id: true, email: true, status: true },
    });
    expect(result).toEqual({
      id: 'user-1',
      email: 'owner@example.com',
      impersonated: undefined,
      impersonatedBy: undefined,
    });
  });

  it('propagates impersonated/impersonatedBy for impersonation tokens', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'owner@example.com',
      status: 'active',
    });

    const futureEpoch = nowEpochSeconds() + 3600;
    const result = await strategy.validate({
      sub: 'user-1',
      impersonated: true,
      impersonatedBy: 'admin-1',
      exp: futureEpoch,
    });

    expect(result).toMatchObject({
      impersonated: true,
      impersonatedBy: 'admin-1',
    });
  });

  it('throws SessionExpiredException when exp is absent and user is missing', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    await expect(strategy.validate({ sub: 'ghost' })).rejects.toBeInstanceOf(
      SessionExpiredException,
    );
  });

  it('throws SessionExpiredException when user is inactive (not active)', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'owner@example.com',
      status: 'suspended',
    });
    await expect(strategy.validate({ sub: 'user-1' })).rejects.toBeInstanceOf(
      SessionExpiredException,
    );
  });

  it('does NOT throw on expired exp when impersonated=false if the user is missing', async () => {
    // Expiration branch short-circuits BEFORE the user lookup: an expired
    // non-impersonated token always yields SessionExpiredException regardless
    // of what the user record contains.
    const pastEpoch = nowEpochSeconds() - 3600;
    await expect(
      strategy.validate({ sub: 'user-1', exp: pastEpoch }),
    ).rejects.toBeInstanceOf(SessionExpiredException);
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });
});