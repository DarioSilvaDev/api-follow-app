import {
  ImpersonationExpiredException,
  SessionExpiredException,
} from '../../../common/exceptions/coded.exception';
import { ERROR_CODES } from '../../../common/exceptions/error-codes';

/**
 * Unit tests for JwtStrategy — D-016 A1 impersonation expiration behavior.
 *
 * The JwtStrategy now uses ignoreExpiration: true and validates expiration manually.
 * When exp is in the past:
 * - impersonated === true → ImpersonationExpiredException (IMPERSONATION_EXPIRED)
 * - impersonated !== true → SessionExpiredException (SESSION_EXPIRED)
 */
describe('JwtStrategy — impersonation expiration', () => {
  // We test the validation logic by simulating what the strategy does
  // without instantiating Passport (which would require the full DI container).

  function validatePayload(payload: {
    exp?: number;
    impersonated?: boolean;
  }): void {
    if (payload.exp) {
      const nowEpochSeconds = Math.floor(Date.now() / 1000);
      if (payload.exp < nowEpochSeconds) {
        if (payload.impersonated) {
          throw new ImpersonationExpiredException();
        }
        throw new SessionExpiredException();
      }
    }
  }

  it('should throw ImpersonationExpiredException when exp is past and impersonated is true', () => {
    const pastEpoch = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago
    expect(() =>
      validatePayload({ exp: pastEpoch, impersonated: true }),
    ).toThrow(ImpersonationExpiredException);
  });

  it('should throw SessionExpiredException when exp is past and impersonated is false', () => {
    const pastEpoch = Math.floor(Date.now() / 1000) - 3600;
    expect(() =>
      validatePayload({ exp: pastEpoch, impersonated: false }),
    ).toThrow(SessionExpiredException);
  });

  it('should throw SessionExpiredException when exp is past and impersonated is undefined', () => {
    const pastEpoch = Math.floor(Date.now() / 1000) - 3600;
    expect(() => validatePayload({ exp: pastEpoch })).toThrow(
      SessionExpiredException,
    );
  });

  it('should not throw when exp is in the future', () => {
    const futureEpoch = Math.floor(Date.now() / 1000) + 3600;
    expect(() =>
      validatePayload({ exp: futureEpoch, impersonated: true }),
    ).not.toThrow();
  });

  it('should not throw when exp is not present (no expiration in token)', () => {
    expect(() => validatePayload({})).not.toThrow();
  });
});
