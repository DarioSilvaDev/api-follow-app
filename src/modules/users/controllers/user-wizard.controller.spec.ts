import {
  GUARDS_METADATA,
  PATH_METADATA,
  METHOD_METADATA,
} from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { UserWizardController } from './user-wizard.controller';

// @nestjs/throttler v6 guarda el metadata por throttler con nombre:
// 'THROTTLER:LIMIT<name>' / 'THROTTLER:TTL<name>'. El throttler sin nombre
// se llama 'default'.
const THROTTLER_LIMIT_DEFAULT = 'THROTTLER:LIMITdefault';
const THROTTLER_TTL_DEFAULT = 'THROTTLER:TTLdefault';

/**
 * UserWizardController — D-106 wizard público de usuario de plataforma.
 *
 * Clase SIN guards (ni JwtAuthGuard): opera con token de invitación one-shot.
 * Ambos endpoints llevan ThrottlerGuard con límites propios (SC-3):
 * - GET invitations/:token (preview) → 10 req / 60s por IP;
 * - POST claim → 5 req / 300s por IP (mismo patrón que reset-password).
 */
describe('UserWizardController — D-106 wizard público (routes / guards / throttle SC-3)', () => {
  const proto = UserWizardController.prototype as Record<string, unknown>;
  const validateMethod = proto['validate'] as object;
  const claimMethod = proto['claim'] as object;

  const methodGuards = (method: object): Function[] =>
    (Reflect.getMetadata(GUARDS_METADATA, method) ?? []) as Function[];

  it('no aplica guards a nivel de clase (wizard público por token de invitación)', () => {
    expect(Reflect.getMetadata(PATH_METADATA, UserWizardController)).toBe(
      'users/wizard',
    );
    const classGuards = Reflect.getMetadata(
      GUARDS_METADATA,
      UserWizardController,
    );
    expect(classGuards ?? []).not.toContain(ThrottlerGuard);
  });

  it('GET invitations/:token está montado en invitations/:token con GET', () => {
    expect(Reflect.getMetadata(METHOD_METADATA, validateMethod)).toBe(
      RequestMethod.GET,
    );
    expect(Reflect.getMetadata(PATH_METADATA, validateMethod)).toBe(
      'invitations/:token',
    );
  });

  it('GET preview lleva ThrottlerGuard con throttle 10 req / 60s por IP (SC-3)', () => {
    expect(methodGuards(validateMethod)).toContain(ThrottlerGuard);
    expect(Reflect.getMetadata(THROTTLER_LIMIT_DEFAULT, validateMethod)).toBe(
      10,
    );
    expect(Reflect.getMetadata(THROTTLER_TTL_DEFAULT, validateMethod)).toBe(
      60000,
    );
  });

  it('POST claim está montado en claim con POST', () => {
    expect(Reflect.getMetadata(METHOD_METADATA, claimMethod)).toBe(
      RequestMethod.POST,
    );
    expect(Reflect.getMetadata(PATH_METADATA, claimMethod)).toBe('claim');
  });

  it('POST claim lleva ThrottlerGuard con throttle estricto 5 req / 300s por IP (SC-3)', () => {
    expect(methodGuards(claimMethod)).toContain(ThrottlerGuard);
    expect(Reflect.getMetadata(THROTTLER_LIMIT_DEFAULT, claimMethod)).toBe(5);
    expect(Reflect.getMetadata(THROTTLER_TTL_DEFAULT, claimMethod)).toBe(
      300000,
    );
  });
});
