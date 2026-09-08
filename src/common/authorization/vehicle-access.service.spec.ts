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
      prismaMock.$queryRawUnsafe.mockResolvedValue([{ workshop_id: 'workshop-1' }]);
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
});
