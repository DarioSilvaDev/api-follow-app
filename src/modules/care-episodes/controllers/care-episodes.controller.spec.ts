import { GUARDS_METADATA } from '@nestjs/common/constants';
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
  const classGuards = Reflect.getMetadata(GUARDS_METADATA, CareEpisodesController) as
    | Function[]
    | undefined;

  function methodGuards(method: string): Function[] {
    const target = (CareEpisodesController.prototype as Record<string, unknown>)[
      method
    ] as object | undefined;
    return target ? ((Reflect.getMetadata(GUARDS_METADATA, target) ?? []) as Function[]) : [];
  }

  function permissionsFor(method: string): string[] | undefined {
    const target = (CareEpisodesController.prototype as Record<string, unknown>)[
      method
    ] as object | undefined;
    return target ? (Reflect.getMetadata(PERMISSIONS_KEY, target) as string[] | undefined) : undefined;
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
});