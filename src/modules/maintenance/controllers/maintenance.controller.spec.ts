import { ForbiddenException, ExecutionContext } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { MaintenanceController } from './maintenance.controller';
import { PERMISSIONS_KEY } from '../../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { WorkshopOnlyGuard } from '../../../common/guards/workshop-only.guard';

/**
 * Maintenance write endpoints — D-024 Amendment 2 (Opción A).
 *
 * Maintenance writes (create, update, cancel, convert, items, approve) are
 * WORKSHOP-only by design:
 *
 *   PermissionsGuard + @Permissions(...) already denies PERSONAL for regular
 *   users (workshop permissions are only loaded inside a WORKSHOP context).
 *
 *   WorkshopOnlyGuard closes the super_admin escape: the unconditional
 *   super_admin bypass in PermissionsGuard must not allow maintenance writes
 *   from PERSONAL. WorkshopOnlyGuard runs first and denies any context that is
 *   not WORKSHOP (PERSONAL, PLATFORM, missing), regardless of system role.
 *
 * Read endpoints (list/get/history) intentionally do NOT carry
 * WorkshopOnlyGuard: the owner in PERSONAL keeps read access with
 * ownership/access validation via VehicleAccessService.
 */
describe('MaintenanceController — D-024 A2 (Opción A): maintenance writes are WORKSHOP-only', () => {
  const controller = MaintenanceController as unknown as {
    prototype: Record<string, unknown>;
  };

  function permissionsFor(method: string): string[] | undefined {
    const target = controller.prototype[method];
    return (target as Function | undefined) !== undefined
      ? (Reflect.getMetadata(
          PERMISSIONS_KEY,
          target as object,
        ) as string[] | undefined)
      : undefined;
  }

  function guardsFor(method: string): Function[] | undefined {
    const target = controller.prototype[method];
    return (target as Function | undefined) !== undefined
      ? (Reflect.getMetadata(
          GUARDS_METADATA,
          target as object,
        ) as Function[] | undefined)
      : undefined;
  }

  // ──────────────────────────────────────────────────────────
  // Write endpoints (must be WORKSHOP-only)
  // ──────────────────────────────────────────────────────────

  const writeEndpoints: Array<[string, string]> = [
    ['createAppointment', 'appointment.create'],
    ['createWorkOrder', 'workorder.create'],
    ['createServiceRecord', 'service-record.create'],
    ['createEstimate', 'estimate.create'],
    ['updateAppointment', 'appointment.update'],
    ['cancelAppointment', 'appointment.cancel'],
    ['updateWorkOrderStatus', 'workorder.close'],
    ['addWorkOrderItem', 'workorder.item.add'],
    ['updateEstimateStatus', 'estimate.approve'],
    ['convertEstimate', 'estimate.convert'],
  ];

  it.each(writeEndpoints)(
    '%s carries @Permissions(%s)',
    (method, permission) => {
      expect(permissionsFor(method)).toEqual([permission]);
    },
  );

  it.each(writeEndpoints.map(([method]) => method))(
    '%s carries WorkshopOnlyGuard (denies PERSONAL/PLATFORM, even super_admin)',
    (method) => {
      const guards = guardsFor(method) ?? [];
      expect(guards).toContain(WorkshopOnlyGuard);
      // WorkshopOnlyGuard must be applied BEFORE PermissionsGuard so the
      // super_admin bypass in PermissionsGuard cannot be reached from PERSONAL.
      expect(guards.indexOf(WorkshopOnlyGuard)).toBeLessThan(
        guards.indexOf(PermissionsGuard),
      );
    },
  );

  it.each(writeEndpoints.map(([method]) => method))(
    '%s carries PermissionsGuard (workshop permission enforcement)',
    (method) => {
      expect(guardsFor(method) ?? []).toContain(PermissionsGuard);
    },
  );

  // ──────────────────────────────────────────────────────────
  // Read endpoints (must remain reachable from PERSONAL)
  // ──────────────────────────────────────────────────────────

  const readEndpoints = [
    'listAppointments',
    'listWorkOrders',
    'getAppointment',
    'getWorkOrder',
    'getVehicleServiceHistory',
  ];

  it.each(readEndpoints)(
    '%s does NOT carry WorkshopOnlyGuard (owner in PERSONAL keeps read access)',
    (method) => {
      const guards = guardsFor(method) ?? [];
      expect(guards).not.toContain(WorkshopOnlyGuard);
    },
  );

  it.each(readEndpoints)(
    '%s does NOT carry PermissionsGuard (read access is ownership/access-based)',
    (method) => {
      const guards = guardsFor(method) ?? [];
      expect(guards).not.toContain(PermissionsGuard);
    },
  );
});

// ──────────────────────────────────────────────────────────
// WorkshopOnlyGuard — behavior unit tests (Opción A matrix)
// ──────────────────────────────────────────────────────────

describe('WorkshopOnlyGuard — D-024 A2 behavior matrix', () => {
  let guard: WorkshopOnlyGuard;

  function makeContext(context: unknown): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => ({ context }),
      }),
    } as unknown as ExecutionContext;
  }

  beforeEach(() => {
    guard = new WorkshopOnlyGuard();
  });

  it('denies owner in PERSONAL context (403 Forbidden)', () => {
    const ctx = makeContext({ type: 'PERSONAL', userId: 'owner-1' });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('denies super_admin in PERSONAL context (403 Forbidden)', () => {
    const ctx = makeContext({ type: 'PERSONAL', userId: 'super-admin-1' });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('denies PLATFORM context (403 Forbidden)', () => {
    const ctx = makeContext({ type: 'PLATFORM', userId: 'admin-1' });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('denies missing/undefined context (403 Forbidden)', () => {
    const ctx = makeContext(undefined);
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('allows workshop member in WORKSHOP context', () => {
    const ctx = makeContext({
      type: 'WORKSHOP',
      userId: 'mechanic-1',
      workshopId: 'workshop-1',
      memberId: 'member-1',
      roleId: 'role-1',
    });
    expect(guard.canActivate(ctx)).toBe(true);
  });
});