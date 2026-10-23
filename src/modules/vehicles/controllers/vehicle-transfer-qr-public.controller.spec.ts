import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { VehicleTransferQrPublicController } from './vehicle-transfer-qr-public.controller';

// @nestjs/throttler v6 guarda el metadata por throttler con nombre:
// 'THROTTLER:LIMIT<name>' / 'THROTTLER:TTL<name>'. El bucket sin nombre es 'default'.
const THROTTLER_LIMIT_DEFAULT = 'THROTTLER:LIMITdefault';
const THROTTLER_TTL_DEFAULT = 'THROTTLER:TTLdefault';

/**
 * VehicleTransferQrPublicController — Gap 1 D-09.
 *
 * El preview del QR debe ser público (un receptor anónimo lo consulta antes de
 * autenticarse). Se mueve a un controller separado SIN `JwtAuthGuard`, con la
 * misma ruta y el mismo límite (10 req / 60s por IP) que antes.
 */
describe('VehicleTransferQrPublicController — D-09 preview público', () => {
  const proto = VehicleTransferQrPublicController.prototype as Record<
    string,
    unknown
  >;
  const previewMethod = proto['preview'] as object;

  const methodGuards = (method: object): Function[] =>
    (Reflect.getMetadata(GUARDS_METADATA, method) ?? []) as Function[];

  it('está montado en vehicles/transfer/qr', () => {
    expect(
      Reflect.getMetadata(PATH_METADATA, VehicleTransferQrPublicController),
    ).toBe('vehicles/transfer/qr');
  });

  it('NO aplica guards a nivel de clase (preview público, sin JWT)', () => {
    const classGuards =
      (Reflect.getMetadata(GUARDS_METADATA, VehicleTransferQrPublicController) ??
        []) as Function[];
    expect(classGuards).not.toContain(ThrottlerGuard);
  });

  it('GET :token está montado con GET', () => {
    expect(Reflect.getMetadata(METHOD_METADATA, previewMethod)).toBe(
      RequestMethod.GET,
    );
    expect(Reflect.getMetadata(PATH_METADATA, previewMethod)).toBe(':token');
  });

  it('lleva ThrottlerGuard con throttle 10 req / 60s por IP (brute-force del token)', () => {
    expect(methodGuards(previewMethod)).toContain(ThrottlerGuard);
    expect(Reflect.getMetadata(THROTTLER_LIMIT_DEFAULT, previewMethod)).toBe(10);
    expect(Reflect.getMetadata(THROTTLER_TTL_DEFAULT, previewMethod)).toBe(
      60000,
    );
  });
});
