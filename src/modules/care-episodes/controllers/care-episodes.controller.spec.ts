// uuid@14 es ESM-only; se mockea antes de importar (el controller transita
// handlers → StorageR2Service) — patrón consistente con vehicles.controller.spec.ts.
jest.mock('uuid', () => ({ v4: () => 'test-uuid' }));

import { GUARDS_METADATA, INTERCEPTORS_METADATA } from '@nestjs/common/constants';
import { ThrottlerGuard } from '@nestjs/throttler';
import { CareEpisodesController } from './care-episodes.controller';
import { PERMISSIONS_KEY } from '../../../common/decorators/permissions.decorator';
import { ContextGuard } from '../../../common/context/guards/context.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { WorkshopOnlyGuard } from '../../../common/guards/workshop-only.guard';
import { JwtAuthGuard } from '../../auth/strategies/jwt-auth.guard';

/**
 * CareEpisodesController — F-020 guard matrix.
 *
 *   POST /care-episodes (create):
 *     class  — JwtAuthGuard + ContextGuard (authenticated + resolved context)
 *     method — WorkshopOnlyGuard BEFORE PermissionsGuard + @Permissions('care-episode.create')
 *              (WorkshopOnly first prevents the PermissionsGuard super_admin
 *              bypass from being reached from PERSONAL — D-024 A2 pattern,
 *              applied verbatim to care-episode creation per spec §6.)
 *
 *   GET /care-episodes/lookup (find vehicle by plate):
 *     class  — JwtAuthGuard + ContextGuard
 *     method — WorkshopOnlyGuard + ThrottlerGuard (no PermissionsGuard:
 *              lookup does not need the permission, only WORKSHOP context +
 *              rate limiting to prevent plate enumeration — spec §6.2)
 */
describe('CareEpisodesController — F-020 guard matrix', () => {
  const classGuards = Reflect.getMetadata(
    GUARDS_METADATA,
    CareEpisodesController,
  ) as Function[] | undefined;

  function methodGuards(method: string): Function[] {
    const target = (
      CareEpisodesController.prototype as Record<string, unknown>
    )[method] as object | undefined;
    return target
      ? ((Reflect.getMetadata(GUARDS_METADATA, target) ?? []) as Function[])
      : [];
  }

  function permissionsFor(method: string): string[] | undefined {
    const target = (
      CareEpisodesController.prototype as Record<string, unknown>
    )[method] as object | undefined;
    return target
      ? (Reflect.getMetadata(PERMISSIONS_KEY, target) as string[] | undefined)
      : undefined;
  }

  // ──────────────────────────────────────────────────────
  // Class-level guards
  // ──────────────────────────────────────────────────────

  it('applies JwtAuthGuard + ContextGuard at class level (all endpoints)', () => {
    expect(classGuards).toContain(JwtAuthGuard);
    expect(classGuards).toContain(ContextGuard);
  });

  // ──────────────────────────────────────────────────────
  // POST create
  // ──────────────────────────────────────────────────────

  it('POST create carries @Permissions(care-episode.create)', () => {
    expect(permissionsFor('create')).toEqual(['care-episode.create']);
  });

  it('POST create carries PermissionsGuard', () => {
    expect(methodGuards('create')).toContain(PermissionsGuard);
  });

  it('POST create carries WorkshopOnlyGuard BEFORE PermissionsGuard (no super_admin bypass from PERSONAL)', () => {
    const guards = methodGuards('create');
    expect(guards).toContain(WorkshopOnlyGuard);
    expect(guards.indexOf(WorkshopOnlyGuard)).toBeLessThan(
      guards.indexOf(PermissionsGuard),
    );
  });

  // ──────────────────────────────────────────────────────
  // GET lookup
  // ──────────────────────────────────────────────────────

  it('GET lookup carries WorkshopOnlyGuard (WORKSHOP context required)', () => {
    expect(methodGuards('lookup')).toContain(WorkshopOnlyGuard);
  });

  it('GET lookup carries ThrottlerGuard but NOT PermissionsGuard (no permission, rate limit only)', () => {
    const guards = methodGuards('lookup');
    expect(guards).toContain(ThrottlerGuard);
    expect(guards).not.toContain(PermissionsGuard);
  });

  // ──────────────────────────────────────────────────────
  // POST owner (RF-1)
  // ──────────────────────────────────────────────────────

  it('POST owner carries ThrottlerGuard but NOT WorkshopOnlyGuard nor PermissionsGuard (PERSONAL context, ownership enforced by handler)', () => {
    const guards = methodGuards('createOwner');
    expect(guards).toContain(ThrottlerGuard);
    expect(guards).not.toContain(WorkshopOnlyGuard);
    expect(guards).not.toContain(PermissionsGuard);
  });

  it('POST owner has NO permission requirement', () => {
    expect(permissionsFor('createOwner')).toBeUndefined();
  });

  it('POST owner is decorated with a multipart interceptor (S6 dual route: FilesInterceptor), without touching guards/permissions', () => {
    const target = (
      CareEpisodesController.prototype as Record<string, unknown>
    )['createOwner'] as object | undefined;
    const interceptors = target
      ? (Reflect.getMetadata(INTERCEPTORS_METADATA, target) ?? [])
      : [];
    // El interceptor acepta JSON (multer ignora no-multipart) y agrega
    // el parseo multipart/form-data del campo `files` — la ruta es DUAL.
    expect(interceptors.length).toBeGreaterThan(0);
  });

  // ──────────────────────────────────────────────────────
  // GET verifications (RF-4)
  // ──────────────────────────────────────────────────────

  it('GET verifications carries @Permissions(care-episode.verify)', () => {
    expect(permissionsFor('listVerifications')).toEqual([
      'care-episode.verify',
    ]);
  });

  it('GET verifications carries WorkshopOnlyGuard BEFORE PermissionsGuard', () => {
    const guards = methodGuards('listVerifications');
    expect(guards).toContain(PermissionsGuard);
    expect(guards.indexOf(WorkshopOnlyGuard)).toBeLessThan(
      guards.indexOf(PermissionsGuard),
    );
  });

  // ──────────────────────────────────────────────────────
  // POST :id/verify (RF-5)
  // ──────────────────────────────────────────────────────

  it('POST verify carries @Permissions(care-episode.verify)', () => {
    expect(permissionsFor('verify')).toEqual(['care-episode.verify']);
  });

  it('POST verify carries WorkshopOnlyGuard BEFORE PermissionsGuard', () => {
    const guards = methodGuards('verify');
    expect(guards).toContain(PermissionsGuard);
    expect(guards.indexOf(WorkshopOnlyGuard)).toBeLessThan(
      guards.indexOf(PermissionsGuard),
    );
  });

  // ──────────────────────────────────────────────────────
  // GET :id (S1 — detail con proyección por actor)
  // ──────────────────────────────────────────────────────

  it('GET :id (getDetail) has NO method-level guards (JwtAuthGuard + ContextGuard from class, authorization in handler)', () => {
    const guards = methodGuards('getDetail');
    expect(guards).not.toContain(WorkshopOnlyGuard);
    expect(guards).not.toContain(PermissionsGuard);
  });

  it('GET :id (getDetail) has NO permission requirement', () => {
    expect(permissionsFor('getDetail')).toBeUndefined();
  });

  // ──────────────────────────────────────────────────────
  // POST :id/attachments (S4 — attach-after del taller)
  // ──────────────────────────────────────────────────────

  it('POST attachments carries @Permissions(care-episode.attach)', () => {
    expect(permissionsFor('attach')).toEqual(['care-episode.attach']);
  });

  it('POST attachments carries WorkshopOnlyGuard BEFORE PermissionsGuard (no super_admin bypass from PERSONAL)', () => {
    const guards = methodGuards('attach');
    expect(guards).toContain(PermissionsGuard);
    expect(guards.indexOf(WorkshopOnlyGuard)).toBeLessThan(
      guards.indexOf(PermissionsGuard),
    );
  });

  // ──────────────────────────────────────────────────────
  // DELETE :id/attachments/:attachmentId (S5 — void auditado)
  // ──────────────────────────────────────────────────────

  it('DELETE attachments has NO permission requirement (gates en handler)', () => {
    expect(permissionsFor('removeAttachment')).toBeUndefined();
  });

  it('DELETE attachments has NO WorkshopOnlyGuard (PERSONAL ctx puede remover)', () => {
    const guards = methodGuards('removeAttachment');
    expect(guards).not.toContain(WorkshopOnlyGuard);
    expect(guards).not.toContain(PermissionsGuard);
  });

  // ──────────────────────────────────────────────────────
  // Route ordering (F-012)
  // ──────────────────────────────────────────────────────

  describe('route ordering (F-012)', () => {
    const methodOrder = Object.getOwnPropertyNames(
      CareEpisodesController.prototype,
    ).filter((name) => name !== 'constructor');

    it('declares static GET routes (lookup, verifications) BEFORE GET :id (getDetail)', () => {
      expect(methodOrder.indexOf('lookup')).toBeLessThan(
        methodOrder.indexOf('getDetail'),
      );
      expect(methodOrder.indexOf('listVerifications')).toBeLessThan(
        methodOrder.indexOf('getDetail'),
      );
    });

    it('declares POST owner (static) BEFORE dynamic POST :id/attachments', () => {
      expect(methodOrder.indexOf('createOwner')).toBeLessThan(
        methodOrder.indexOf('attach'),
      );
    });
  });
});
