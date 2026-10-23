import { ForbiddenException } from '@nestjs/common';
import { VehicleAccessService } from './vehicle-access.service';
import { AuthenticatedUser } from '../types/auth.types';
import { CurrentContext } from '../context/interfaces/current-context.interface';

/**
 * Unit tests for VehicleAccessService — D-024 A1 matrix.
 *
 * Tests:
 * - assertVehicleAccess (full mode):
 *   1. Vehicle not exists → return (no throw)
 *   2. Active ownership → return
 *   3. Active VehicleAccess → return
 *   4. WORKSHOP context + membership + vehicle-workshop association → return
 *   5. WORKSHOP context + membership + NO association → ForbiddenException
 *   6. WORKSHOP context + NO membership → fall through to super_admin check
 *   7. super_admin → return
 *   8. Nothing matches → ForbiddenException
 *   9. UNION legs: appointments/cancelled excluded, work_orders/cancelled excluded,
 *      estimates present (no filter), service_records present (no filter)
 *
 * - assertOwnershipOrSharedAccess (strict mode):
 *   1. Vehicle not exists → return
 *   2. Active ownership → return
 *   3. Active VehicleAccess → return
 *   4. super_admin → return
 *   5. Nothing matches → ForbiddenException
 */
describe('VehicleAccessService', () => {
  let service: VehicleAccessService;
  let prismaMock: {
    vehicle: { findUnique: jest.Mock };
    vehicleOwnership: { findFirst: jest.Mock };
    vehicleAccess: { findFirst: jest.Mock };
    workshopMember: { findUnique: jest.Mock };
    dealershipMember: { findUnique: jest.Mock };
    systemRole: { findUnique: jest.Mock };
    systemRoleAssignment: { findFirst: jest.Mock };
    $queryRawUnsafe: jest.Mock;
  };

  const mockUser: AuthenticatedUser = {
    id: 'user-1',
    email: 'test@example.com',
  };

  const personalCtx: CurrentContext = {
    type: 'PERSONAL',
    userId: 'user-1',
  };

  const workshopCtx: CurrentContext = {
    type: 'WORKSHOP',
    userId: 'user-1',
    workshopId: 'workshop-1',
    memberId: 'member-1',
    roleId: 'role-1',
  };

  beforeEach(() => {
    prismaMock = {
      vehicle: { findUnique: jest.fn() },
      vehicleOwnership: { findFirst: jest.fn() },
      vehicleAccess: { findFirst: jest.fn() },
      workshopMember: { findUnique: jest.fn() },
      dealershipMember: { findUnique: jest.fn() },
      systemRole: { findUnique: jest.fn() },
      systemRoleAssignment: { findFirst: jest.fn() },
      $queryRawUnsafe: jest.fn(),
    };
    service = new VehicleAccessService(prismaMock as any);
  });

  describe('assertVehicleAccess (full mode)', () => {
    it('should return without throwing when vehicle does not exist', async () => {
      prismaMock.vehicle.findUnique.mockResolvedValue(null);
      await expect(
        service.assertVehicleAccess({
          vehicleId: 'v1',
          user: mockUser,
          context: personalCtx,
        }),
      ).resolves.toBeUndefined();
    });

    it('should return when user has active ownership', async () => {
      prismaMock.vehicle.findUnique.mockResolvedValue({ id: 'v1' });
      prismaMock.vehicleOwnership.findFirst.mockResolvedValue({ id: 'own-1' });
      await expect(
        service.assertVehicleAccess({
          vehicleId: 'v1',
          user: mockUser,
          context: personalCtx,
        }),
      ).resolves.toBeUndefined();
    });

    it('should return when user has active VehicleAccess', async () => {
      prismaMock.vehicle.findUnique.mockResolvedValue({ id: 'v1' });
      prismaMock.vehicleOwnership.findFirst.mockResolvedValue(null);
      prismaMock.vehicleAccess.findFirst.mockResolvedValue({ id: 'acc-1' });
      await expect(
        service.assertVehicleAccess({
          vehicleId: 'v1',
          user: mockUser,
          context: personalCtx,
        }),
      ).resolves.toBeUndefined();
    });

    it('should return when WORKSHOP context with active membership and vehicle-workshop association', async () => {
      prismaMock.vehicle.findUnique.mockResolvedValue({ id: 'v1' });
      prismaMock.vehicleOwnership.findFirst.mockResolvedValue(null);
      prismaMock.vehicleAccess.findFirst.mockResolvedValue(null);
      prismaMock.workshopMember.findUnique.mockResolvedValue({
        id: 'member-1',
        status: 'active',
      });
      prismaMock.$queryRawUnsafe.mockResolvedValue([
        { workshop_id: 'workshop-1' },
      ]);
      await expect(
        service.assertVehicleAccess({
          vehicleId: 'v1',
          user: mockUser,
          context: workshopCtx,
        }),
      ).resolves.toBeUndefined();
    });

    it('should throw ForbiddenException when WORKSHOP context with membership but NO vehicle-workshop association', async () => {
      prismaMock.vehicle.findUnique.mockResolvedValue({ id: 'v1' });
      prismaMock.vehicleOwnership.findFirst.mockResolvedValue(null);
      prismaMock.vehicleAccess.findFirst.mockResolvedValue(null);
      prismaMock.workshopMember.findUnique.mockResolvedValue({
        id: 'member-1',
        status: 'active',
      });
      prismaMock.$queryRawUnsafe.mockResolvedValue([]);
      prismaMock.systemRole.findUnique.mockResolvedValue(null);
      await expect(
        service.assertVehicleAccess({
          vehicleId: 'v1',
          user: mockUser,
          context: workshopCtx,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should exclude cancelled appointments and work_orders from vehicle-workshop association (Wave P3 — B6 Amendment 3)', async () => {
      prismaMock.vehicle.findUnique.mockResolvedValue({ id: 'v1' });
      prismaMock.vehicleOwnership.findFirst.mockResolvedValue(null);
      prismaMock.vehicleAccess.findFirst.mockResolvedValue(null);
      prismaMock.workshopMember.findUnique.mockResolvedValue({
        id: 'member-1',
        status: 'active',
      });
      prismaMock.$queryRawUnsafe.mockResolvedValue([] as unknown[]);
      prismaMock.systemRole.findUnique.mockResolvedValue(null);

      await expect(
        service.assertVehicleAccess({
          vehicleId: 'v1',
          user: mockUser,
          context: workshopCtx,
        }),
      ).rejects.toThrow(ForbiddenException);

      const sql = prismaMock.$queryRawUnsafe.mock.calls[0][0] as string;

      // (a) appointments leg: status <> 'cancelled'
      expect(sql).toContain(
        "SELECT workshop_id FROM appointments WHERE vehicle_id = $1 AND workshop_id = $2 AND status <> 'cancelled'",
      );
      // (b) work_orders leg: status <> 'cancelled' (Wave P3 — Amendment 3)
      expect(sql).toContain(
        "SELECT workshop_id FROM work_orders WHERE vehicle_id = $1 AND workshop_id = $2 AND status <> 'cancelled'",
      );
      // (c) estimates leg: present WITHOUT status filter (D-019)
      expect(sql).toContain(
        'SELECT workshop_id FROM estimates WHERE vehicle_id = $1 AND workshop_id = $2',
      );
      // (d) service_records leg: present WITHOUT status filter
      expect(sql).toContain(
        'SELECT workshop_id FROM service_records WHERE vehicle_id = $1 AND workshop_id = $2',
      );
    });

    it('should throw ForbiddenException when WORKSHOP context with no membership and no super_admin', async () => {
      prismaMock.vehicle.findUnique.mockResolvedValue({ id: 'v1' });
      prismaMock.vehicleOwnership.findFirst.mockResolvedValue(null);
      prismaMock.vehicleAccess.findFirst.mockResolvedValue(null);
      prismaMock.workshopMember.findUnique.mockResolvedValue(null);
      prismaMock.systemRole.findUnique.mockResolvedValue(null);
      await expect(
        service.assertVehicleAccess({
          vehicleId: 'v1',
          user: mockUser,
          context: workshopCtx,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should return when user has super_admin system role', async () => {
      prismaMock.vehicle.findUnique.mockResolvedValue({ id: 'v1' });
      prismaMock.vehicleOwnership.findFirst.mockResolvedValue(null);
      prismaMock.vehicleAccess.findFirst.mockResolvedValue(null);
      prismaMock.systemRole.findUnique.mockResolvedValue({ id: 'sa-role' });
      prismaMock.systemRoleAssignment.findFirst.mockResolvedValue({
        id: 'assign-1',
      });
      await expect(
        service.assertVehicleAccess({
          vehicleId: 'v1',
          user: mockUser,
          context: personalCtx,
        }),
      ).resolves.toBeUndefined();
    });

    it('should throw ForbiddenException when no access path matches', async () => {
      prismaMock.vehicle.findUnique.mockResolvedValue({ id: 'v1' });
      prismaMock.vehicleOwnership.findFirst.mockResolvedValue(null);
      prismaMock.vehicleAccess.findFirst.mockResolvedValue(null);
      prismaMock.systemRole.findUnique.mockResolvedValue(null);
      await expect(
        service.assertVehicleAccess({
          vehicleId: 'v1',
          user: mockUser,
          context: personalCtx,
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('assertOwnershipOrSharedAccess (strict mode)', () => {
    it('should return without throwing when vehicle does not exist', async () => {
      prismaMock.vehicle.findUnique.mockResolvedValue(null);
      await expect(
        service.assertOwnershipOrSharedAccess({
          vehicleId: 'v1',
          user: mockUser,
        }),
      ).resolves.toBeUndefined();
    });

    it('should return when user has active ownership', async () => {
      prismaMock.vehicle.findUnique.mockResolvedValue({ id: 'v1' });
      prismaMock.vehicleOwnership.findFirst.mockResolvedValue({ id: 'own-1' });
      await expect(
        service.assertOwnershipOrSharedAccess({
          vehicleId: 'v1',
          user: mockUser,
        }),
      ).resolves.toBeUndefined();
    });

    it('should return when user has active VehicleAccess', async () => {
      prismaMock.vehicle.findUnique.mockResolvedValue({ id: 'v1' });
      prismaMock.vehicleOwnership.findFirst.mockResolvedValue(null);
      prismaMock.vehicleAccess.findFirst.mockResolvedValue({ id: 'acc-1' });
      await expect(
        service.assertOwnershipOrSharedAccess({
          vehicleId: 'v1',
          user: mockUser,
        }),
      ).resolves.toBeUndefined();
    });

    it('should return when user has super_admin system role', async () => {
      prismaMock.vehicle.findUnique.mockResolvedValue({ id: 'v1' });
      prismaMock.vehicleOwnership.findFirst.mockResolvedValue(null);
      prismaMock.vehicleAccess.findFirst.mockResolvedValue(null);
      prismaMock.systemRole.findUnique.mockResolvedValue({ id: 'sa-role' });
      prismaMock.systemRoleAssignment.findFirst.mockResolvedValue({
        id: 'assign-1',
      });
      await expect(
        service.assertOwnershipOrSharedAccess({
          vehicleId: 'v1',
          user: mockUser,
        }),
      ).resolves.toBeUndefined();
    });

    it('should throw ForbiddenException when no access path matches', async () => {
      prismaMock.vehicle.findUnique.mockResolvedValue({ id: 'v1' });
      prismaMock.vehicleOwnership.findFirst.mockResolvedValue(null);
      prismaMock.vehicleAccess.findFirst.mockResolvedValue(null);
      prismaMock.systemRole.findUnique.mockResolvedValue(null);
      await expect(
        service.assertOwnershipOrSharedAccess({
          vehicleId: 'v1',
          user: mockUser,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should NOT check workshop membership (strict mode)', async () => {
      prismaMock.vehicle.findUnique.mockResolvedValue({ id: 'v1' });
      prismaMock.vehicleOwnership.findFirst.mockResolvedValue(null);
      prismaMock.vehicleAccess.findFirst.mockResolvedValue(null);
      prismaMock.systemRole.findUnique.mockResolvedValue(null);
      await expect(
        service.assertOwnershipOrSharedAccess({
          vehicleId: 'v1',
          user: mockUser,
        }),
      ).rejects.toThrow(ForbiddenException);
      // workshopMember.findUnique should NOT have been called in strict mode
      expect(prismaMock.workshopMember.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('DEALERSHIP read access — FIX-B1 (RB-04)', () => {
    const dealershipCtx: CurrentContext = {
      type: 'DEALERSHIP',
      userId: 'user-1',
      dealershipId: 'dealership-1',
      memberId: 'member-1',
      roleId: 'role-1',
    };

    const memberWithReadPermission = {
      id: 'member-1',
      status: 'active',
      role: {
        permissions: [{ permission: { code: 'history.view' } }],
      },
    };

    const memberWithoutReadPermission = {
      id: 'member-1',
      status: 'active',
      role: {
        permissions: [{ permission: { code: 'dealership.vehicle.take' } }],
      },
    };

    it('allows an active member with read permission of the TITULAR dealership', async () => {
      prismaMock.vehicle.findUnique.mockResolvedValue({ id: 'v1' });
      // 1er findFirst (ownership persona) → null; 2do (titularidad dealership) → activo
      prismaMock.vehicleOwnership.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'own-dealer' });
      prismaMock.vehicleAccess.findFirst.mockResolvedValue(null);
      prismaMock.dealershipMember.findUnique.mockResolvedValue(
        memberWithReadPermission,
      );
      await expect(
        service.assertOwnershipOrSharedAccess({
          vehicleId: 'v1',
          user: mockUser,
          context: dealershipCtx,
        }),
      ).resolves.toBeUndefined();
    });

    it('rejects a member of a dealership that is NOT the current titular owner (no leak across dealerships)', async () => {
      prismaMock.vehicle.findUnique.mockResolvedValue({ id: 'v1' });
      prismaMock.vehicleOwnership.findFirst
        .mockResolvedValueOnce(null) // persona
        .mockResolvedValueOnce(null); // dealership NO titular
      prismaMock.vehicleAccess.findFirst.mockResolvedValue(null);
      prismaMock.dealershipMember.findUnique.mockResolvedValue(
        memberWithReadPermission,
      );
      prismaMock.systemRole.findUnique.mockResolvedValue(null);
      await expect(
        service.assertOwnershipOrSharedAccess({
          vehicleId: 'v1',
          user: mockUser,
          context: dealershipCtx,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects an active member whose role lacks read permissions (e.g. only take)', async () => {
      prismaMock.vehicle.findUnique.mockResolvedValue({ id: 'v1' });
      prismaMock.vehicleOwnership.findFirst.mockResolvedValue(null);
      prismaMock.vehicleAccess.findFirst.mockResolvedValue(null);
      prismaMock.dealershipMember.findUnique.mockResolvedValue(
        memberWithoutReadPermission,
      );
      prismaMock.systemRole.findUnique.mockResolvedValue(null);
      await expect(
        service.assertOwnershipOrSharedAccess({
          vehicleId: 'v1',
          user: mockUser,
          context: dealershipCtx,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects a non-member caller even in DEALERSHIP context', async () => {
      prismaMock.vehicle.findUnique.mockResolvedValue({ id: 'v1' });
      prismaMock.vehicleOwnership.findFirst.mockResolvedValue(null);
      prismaMock.vehicleAccess.findFirst.mockResolvedValue(null);
      prismaMock.dealershipMember.findUnique.mockResolvedValue(null);
      prismaMock.systemRole.findUnique.mockResolvedValue(null);
      await expect(
        service.assertOwnershipOrSharedAccess({
          vehicleId: 'v1',
          user: mockUser,
          context: dealershipCtx,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('keeps the persona branch first: a personal owner is granted BEFORE the dealership check', async () => {
      prismaMock.vehicle.findUnique.mockResolvedValue({ id: 'v1' });
      prismaMock.vehicleOwnership.findFirst.mockResolvedValue({
        id: 'own-persona',
      });
      await expect(
        service.assertOwnershipOrSharedAccess({
          vehicleId: 'v1',
          user: mockUser,
          context: dealershipCtx,
        }),
      ).resolves.toBeUndefined();
      expect(
        prismaMock.dealershipMember.findUnique,
      ).not.toHaveBeenCalled();
    });

    it('rejects a person WITHOUT access in DEALERSHIP context (no ownership, no access, no membership)', async () => {
      prismaMock.vehicle.findUnique.mockResolvedValue({ id: 'v1' });
      prismaMock.vehicleOwnership.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);
      prismaMock.vehicleAccess.findFirst.mockResolvedValue(null);
      prismaMock.dealershipMember.findUnique.mockResolvedValue(null);
      prismaMock.systemRole.findUnique.mockResolvedValue(null);
      await expect(
        service.assertOwnershipOrSharedAccess({
          vehicleId: 'v1',
          user: mockUser,
          context: dealershipCtx,
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('assertOwnership (Security Review #8 — P1)', () => {
    it('should return without throwing when vehicle does not exist', async () => {
      prismaMock.vehicle.findUnique.mockResolvedValue(null);
      await expect(
        service.assertOwnership({ vehicleId: 'v1', user: mockUser }),
      ).resolves.toBeUndefined();
    });

    it('should return when user has active ownership', async () => {
      prismaMock.vehicle.findUnique.mockResolvedValue({ id: 'v1' });
      prismaMock.vehicleOwnership.findFirst.mockResolvedValue({
        id: 'own-1',
      });
      await expect(
        service.assertOwnership({ vehicleId: 'v1', user: mockUser }),
      ).resolves.toBeUndefined();
    });

    it('should throw 403 PERMISSION_DENIED for a user with only shared VehicleAccess (no ownership)', async () => {
      prismaMock.vehicle.findUnique.mockResolvedValue({ id: 'v1' });
      prismaMock.vehicleOwnership.findFirst.mockResolvedValue(null);
      prismaMock.vehicleAccess.findFirst.mockResolvedValue({
        id: 'acc-1',
      }); // shared access present
      prismaMock.systemRole.findUnique.mockResolvedValue(null);

      await expect(
        service.assertOwnership({ vehicleId: 'v1', user: mockUser }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should return when user has super_admin system role even without ownership', async () => {
      prismaMock.vehicle.findUnique.mockResolvedValue({ id: 'v1' });
      prismaMock.vehicleOwnership.findFirst.mockResolvedValue(null);
      prismaMock.systemRole.findUnique.mockResolvedValue({ id: 'sa-role' });
      prismaMock.systemRoleAssignment.findFirst.mockResolvedValue({
        id: 'assign-1',
      });
      await expect(
        service.assertOwnership({ vehicleId: 'v1', user: mockUser }),
      ).resolves.toBeUndefined();
    });

    it('should NOT use VehicleAccess as a satisfaction path (ownership is required)', async () => {
      prismaMock.vehicle.findUnique.mockResolvedValue({ id: 'v1' });
      prismaMock.vehicleOwnership.findFirst.mockResolvedValue(null);
      prismaMock.vehicleAccess.findFirst.mockResolvedValue({
        id: 'acc-1',
      });
      prismaMock.systemRole.findUnique.mockResolvedValue(null);

      await expect(
        service.assertOwnership({ vehicleId: 'v1', user: mockUser }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getCapabilities (Gap 1 — D-12)', () => {
    const dealershipCtx: CurrentContext = {
      type: 'DEALERSHIP',
      userId: 'user-1',
      dealershipId: 'd1',
      memberId: 'dm1',
      roleId: 'dr1',
    };

    const notSuperAdmin = () => {
      prismaMock.systemRole.findUnique.mockResolvedValue(null);
    };

    const dealershipMember = (codes: string[], status = 'active') => {
      prismaMock.dealershipMember.findUnique.mockResolvedValue({
        status,
        role: {
          permissions: codes.map((code) => ({ permission: { code } })),
        },
      });
    };

    it('super_admin → todas las capacidades en true', async () => {
      prismaMock.systemRole.findUnique.mockResolvedValue({ id: 'sa' });
      prismaMock.systemRoleAssignment.findFirst.mockResolvedValue({ id: 'a1' });

      await expect(
        service.getCapabilities({
          vehicleId: 'v1',
          userId: 'user-1',
          context: personalCtx,
        }),
      ).resolves.toEqual({
        canEdit: true,
        canRecordMileage: true,
        canCorrectVin: true,
      });
    });

    it('PERSONAL con ownership activo → editar, km y VIN', async () => {
      notSuperAdmin();
      prismaMock.vehicleOwnership.findFirst.mockResolvedValue({ id: 'own-1' });

      await expect(
        service.getCapabilities({
          vehicleId: 'v1',
          userId: 'user-1',
          context: personalCtx,
        }),
      ).resolves.toEqual({
        canEdit: true,
        canRecordMileage: true,
        canCorrectVin: true,
      });
    });

    it('PERSONAL sin ownership → todas false', async () => {
      notSuperAdmin();
      prismaMock.vehicleOwnership.findFirst.mockResolvedValue(null);

      await expect(
        service.getCapabilities({
          vehicleId: 'v1',
          userId: 'user-1',
          context: personalCtx,
        }),
      ).resolves.toEqual({
        canEdit: false,
        canRecordMileage: false,
        canCorrectVin: false,
      });
    });

    it('DEALERSHIP titular con permiso → solo canRecordMileage (edición y VIN quedan false)', async () => {
      notSuperAdmin();
      // 1ª consulta: ownership personal (null). 2ª: titularidad de la concesionaria.
      prismaMock.vehicleOwnership.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'titular-1' });
      dealershipMember(['dealership.mileage.record']);

      await expect(
        service.getCapabilities({
          vehicleId: 'v1',
          userId: 'user-1',
          context: dealershipCtx,
        }),
      ).resolves.toEqual({
        canEdit: false,
        canRecordMileage: true,
        canCorrectVin: false,
      });
    });

    it('DEALERSHIP sin permiso de km → canRecordMileage false', async () => {
      notSuperAdmin();
      prismaMock.vehicleOwnership.findFirst.mockResolvedValue(null);
      dealershipMember(['dealership.vehicle.sell']);

      const caps = await service.getCapabilities({
        vehicleId: 'v1',
        userId: 'user-1',
        context: dealershipCtx,
      });

      expect(caps.canRecordMileage).toBe(false);
    });

    it('DEALERSHIP no titular → canRecordMileage false', async () => {
      notSuperAdmin();
      prismaMock.vehicleOwnership.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);
      dealershipMember(['dealership.mileage.record']);

      const caps = await service.getCapabilities({
        vehicleId: 'v1',
        userId: 'user-1',
        context: dealershipCtx,
      });

      expect(caps.canRecordMileage).toBe(false);
    });

    it('DEALERSHIP con membresía no activa → canRecordMileage false', async () => {
      notSuperAdmin();
      prismaMock.vehicleOwnership.findFirst.mockResolvedValue(null);
      dealershipMember(['dealership.mileage.record'], 'inactive');

      const caps = await service.getCapabilities({
        vehicleId: 'v1',
        userId: 'user-1',
        context: dealershipCtx,
      });

      expect(caps.canRecordMileage).toBe(false);
    });

    // ─────────────────────────────────────────────────────────────
    // D-144: la corrección de VIN la pueden hacer owner/admin (titular);
    // el vendedor no cambia identidad. La matriz se resuelve por `role.code`.
    // ─────────────────────────────────────────────────────────────

    const dealershipMemberWithRole = (code: string, status = 'active') => {
      prismaMock.dealershipMember.findUnique.mockResolvedValue({
        status,
        role: { code, permissions: [] },
      });
    };

    // D-133/D-149: miembro con permiso `dealership.vehicle.edit` (owner/admin/
    // seller por igual). El código de rol se incluye para poder combinar la
    // matriz de edición con la de corrección de VIN.
    const dealershipMemberEdit = (code: string, status = 'active') => {
      prismaMock.dealershipMember.findUnique.mockResolvedValue({
        status,
        role: {
          code,
          permissions: [{ permission: { code: 'dealership.vehicle.edit' } }],
        },
      });
    };

    it.each(['owner', 'admin'])(
      'DEALERSHIP %s titular → canCorrectVin true (D-144)',
      async (code) => {
        notSuperAdmin();
        // 1ª: ownership personal (null). 2ª: titularidad de la concesionaria.
        prismaMock.vehicleOwnership.findFirst
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({ id: 'titular-1' });
        dealershipMemberWithRole(code);

        const caps = await service.getCapabilities({
          vehicleId: 'v1',
          userId: 'user-1',
          context: dealershipCtx,
        });

        expect(caps.canCorrectVin).toBe(true);
      },
    );

    it('DEALERSHIP seller titular → canCorrectVin false (D-144: el vendedor no cambia identidad)', async () => {
      notSuperAdmin();
      prismaMock.vehicleOwnership.findFirst.mockResolvedValue(null);
      dealershipMemberWithRole('seller');

      const caps = await service.getCapabilities({
        vehicleId: 'v1',
        userId: 'user-1',
        context: dealershipCtx,
      });

      expect(caps.canCorrectVin).toBe(false);
    });

    it('DEALERSHIP admin NO titular → canCorrectVin false', async () => {
      notSuperAdmin();
      prismaMock.vehicleOwnership.findFirst.mockResolvedValue(null);
      dealershipMemberWithRole('admin');

      const caps = await service.getCapabilities({
        vehicleId: 'v1',
        userId: 'user-1',
        context: dealershipCtx,
      });

      expect(caps.canCorrectVin).toBe(false);
    });

    it('DEALERSHIP admin titular con membresía no activa → canCorrectVin false', async () => {
      notSuperAdmin();
      prismaMock.vehicleOwnership.findFirst.mockResolvedValue(null);
      dealershipMemberWithRole('admin', 'inactive');

      const caps = await service.getCapabilities({
        vehicleId: 'v1',
        userId: 'user-1',
        context: dealershipCtx,
      });

      expect(caps.canCorrectVin).toBe(false);
    });

    // ─────────────────────────────────────────────────────────────
    // D-133/D-149: canEdit — la concesionaria TITULAR ACTIVA edita mientras es
    // titular (owner/admin/seller por igual, `dealership.vehicle.edit`). La
    // escritura muere con la transferencia. PERSONAL queda intacto.
    // ─────────────────────────────────────────────────────────────

    it.each(['owner', 'admin', 'seller'])(
      'DEALERSHIP %s titular con permiso edit → canEdit true (D-149)',
      async (code) => {
        notSuperAdmin();
        // 1ª: ownership personal (null). 2ª: titularidad de la concesionaria.
        prismaMock.vehicleOwnership.findFirst
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({ id: 'titular-1' });
        dealershipMemberEdit(code);

        const caps = await service.getCapabilities({
          vehicleId: 'v1',
          userId: 'user-1',
          context: dealershipCtx,
        });

        expect(caps.canEdit).toBe(true);
      },
    );

    it('DEALERSHIP titular con permiso edit pero la concesionaria NO es titular → canEdit false (la escritura muere con la transferencia)', async () => {
      notSuperAdmin();
      prismaMock.vehicleOwnership.findFirst
        .mockResolvedValueOnce(null) // ownership personal
        .mockResolvedValueOnce(null); // titularidad de la concesionaria (no titular)
      dealershipMemberEdit('owner');

      const caps = await service.getCapabilities({
        vehicleId: 'v1',
        userId: 'user-1',
        context: dealershipCtx,
      });

      expect(caps.canEdit).toBe(false);
    });

    it('DEALERSHIP titular SIN permiso dealership.vehicle.edit → canEdit false', async () => {
      notSuperAdmin();
      prismaMock.vehicleOwnership.findFirst.mockResolvedValue(null);
      dealershipMember(['dealership.mileage.record']);

      const caps = await service.getCapabilities({
        vehicleId: 'v1',
        userId: 'user-1',
        context: dealershipCtx,
      });

      expect(caps.canEdit).toBe(false);
    });

    it('DEALERSHIP con membresía no activa → canEdit false', async () => {
      notSuperAdmin();
      prismaMock.vehicleOwnership.findFirst.mockResolvedValue(null);
      dealershipMemberEdit('owner', 'inactive');

      const caps = await service.getCapabilities({
        vehicleId: 'v1',
        userId: 'user-1',
        context: dealershipCtx,
      });

      expect(caps.canEdit).toBe(false);
    });

    it('PERSONAL con ownership activo → canEdit true (intacto, sin consultar la concesionaria)', async () => {
      notSuperAdmin();
      prismaMock.vehicleOwnership.findFirst.mockResolvedValue({ id: 'own-1' });

      const caps = await service.getCapabilities({
        vehicleId: 'v1',
        userId: 'user-1',
        context: personalCtx,
      });

      expect(caps.canEdit).toBe(true);
      expect(prismaMock.dealershipMember.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('assertDealershipVehicleWrite (D-133/D-149)', () => {
    const dealershipCtx: CurrentContext = {
      type: 'DEALERSHIP',
      userId: 'user-1',
      dealershipId: 'd1',
      memberId: 'dm1',
      roleId: 'dr1',
    };

    const memberWithEdit = (status = 'active') => {
      prismaMock.dealershipMember.findUnique.mockResolvedValue({
        status,
        role: {
          permissions: [{ permission: { code: 'dealership.vehicle.edit' } }],
        },
      });
    };

    it('miembro titular activo con permiso edit → true (owner/admin/seller por igual)', async () => {
      memberWithEdit();
      prismaMock.vehicleOwnership.findFirst.mockResolvedValue({
        id: 'titular-1',
      });

      await expect(
        service.assertDealershipVehicleWrite('v1', 'user-1', dealershipCtx),
      ).resolves.toBe(true);
    });

    it('miembro activo titular SIN permiso edit → false (no consulta titularidad)', async () => {
      prismaMock.dealershipMember.findUnique.mockResolvedValue({
        status: 'active',
        role: { permissions: [{ permission: { code: 'history.view' } }] },
      });

      await expect(
        service.assertDealershipVehicleWrite('v1', 'user-1', dealershipCtx),
      ).resolves.toBe(false);
      expect(prismaMock.vehicleOwnership.findFirst).not.toHaveBeenCalled();
    });

    it('membresía no activa → false', async () => {
      memberWithEdit('inactive');

      await expect(
        service.assertDealershipVehicleWrite('v1', 'user-1', dealershipCtx),
      ).resolves.toBe(false);
    });

    it('caller sin membresía → false', async () => {
      prismaMock.dealershipMember.findUnique.mockResolvedValue(null);

      await expect(
        service.assertDealershipVehicleWrite('v1', 'user-1', dealershipCtx),
      ).resolves.toBe(false);
    });

    it('miembro activo con permiso edit pero la concesionaria NO es titular → false', async () => {
      memberWithEdit();
      prismaMock.vehicleOwnership.findFirst.mockResolvedValue(null);

      await expect(
        service.assertDealershipVehicleWrite('v1', 'user-1', dealershipCtx),
      ).resolves.toBe(false);
    });
  });
});
