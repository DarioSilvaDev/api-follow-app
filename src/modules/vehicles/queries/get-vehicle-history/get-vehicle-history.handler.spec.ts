import { GetVehicleHistoryHandler } from './get-vehicle-history.handler';
import { AuthenticatedUser } from '../../../../common/types/auth.types';

describe('GetVehicleHistoryHandler — PII in history (Security Review #13)', () => {
  let handler: GetVehicleHistoryHandler;
  let prismaMock: {
    vehicle: { findUnique: jest.Mock };
    vehicleOwnership: { findFirst: jest.Mock; findMany: jest.Mock };
    vehicleTransfer: { findMany: jest.Mock };
    vehicleMileage: { findMany: jest.Mock };
    systemRole: { findUnique: jest.Mock };
    systemRoleAssignment: { findFirst: jest.Mock };
  };

  const holderUser: AuthenticatedUser = {
    id: 'holder-1',
    email: 'holder@example.com',
  };
  const ownerUser: AuthenticatedUser = {
    id: 'owner-1',
    email: 'owner@example.com',
  };

  beforeEach(() => {
    prismaMock = {
      vehicle: { findUnique: jest.fn() },
      vehicleOwnership: { findFirst: jest.fn(), findMany: jest.fn() },
      vehicleTransfer: { findMany: jest.fn() },
      vehicleMileage: { findMany: jest.fn() },
      systemRole: { findUnique: jest.fn() },
      systemRoleAssignment: { findFirst: jest.fn() },
    };
    handler = new GetVehicleHistoryHandler(prismaMock as any);
  });

  it('omits owner emails for a shared-access holder (no ownership)', async () => {
    prismaMock.vehicle.findUnique.mockResolvedValue({ id: 'v1' });
    prismaMock.vehicleOwnership.findFirst.mockResolvedValue(null); // not the owner
    prismaMock.systemRole.findUnique.mockResolvedValue({ id: 'super-role' });
    prismaMock.systemRoleAssignment.findFirst.mockResolvedValue(null); // not super
    prismaMock.vehicleOwnership.findMany.mockResolvedValue([
      {
        startsAt: new Date(),
        user: { id: 'owner-1', firstName: 'X', lastName: 'Y' },
      },
    ]);
    prismaMock.vehicleTransfer.findMany.mockResolvedValue([]);
    prismaMock.vehicleMileage.findMany.mockResolvedValue([]);

    const result = await handler.execute('v1', holderUser);

    // The Prisma select must NOT request email for a non-owner holder.
    const findManyArg = prismaMock.vehicleOwnership.findMany.mock.calls[0][0];
    expect(findManyArg.include.user.select).not.toHaveProperty('email');
    expect(findManyArg.include.user.select).toEqual({
      id: true,
      firstName: true,
      lastName: true,
    });
    expect(result.ownerships[0].user).toEqual({
      id: 'owner-1',
      firstName: 'X',
      lastName: 'Y',
    });
  });

  it('includes owner emails for the active owner', async () => {
    prismaMock.vehicle.findUnique.mockResolvedValue({ id: 'v1' });
    prismaMock.vehicleOwnership.findFirst.mockResolvedValue({
      id: 'ownership-1',
    }); // is owner
    prismaMock.vehicleOwnership.findMany.mockResolvedValue([
      {
        startsAt: new Date(),
        user: { id: 'owner-1', firstName: 'X', lastName: 'Y', email: 'o@x.com' },
      },
    ]);
    prismaMock.vehicleTransfer.findMany.mockResolvedValue([]);
    prismaMock.vehicleMileage.findMany.mockResolvedValue([]);

    const result = await handler.execute('v1', ownerUser);

    const findManyArg = prismaMock.vehicleOwnership.findMany.mock.calls[0][0];
    expect(findManyArg.include.user.select).toEqual({
      id: true,
      firstName: true,
      lastName: true,
      email: true,
    });
    expect(result.ownerships[0].user).toEqual({
      id: 'owner-1',
      firstName: 'X',
      lastName: 'Y',
      email: 'o@x.com',
    });
  });

  it('includes owner emails for a super admin', async () => {
    prismaMock.vehicle.findUnique.mockResolvedValue({ id: 'v1' });
    prismaMock.vehicleOwnership.findFirst.mockResolvedValue(null);
    prismaMock.systemRole.findUnique.mockResolvedValue({ id: 'super-role' });
    prismaMock.systemRoleAssignment.findFirst.mockResolvedValue({
      id: 'sa-assign',
    });
    prismaMock.vehicleOwnership.findMany.mockResolvedValue([
      {
        startsAt: new Date(),
        user: { id: 'owner-1', firstName: 'X', lastName: 'Y', email: 'o@x.com' },
      },
    ]);
    prismaMock.vehicleTransfer.findMany.mockResolvedValue([]);
    prismaMock.vehicleMileage.findMany.mockResolvedValue([]);

    const result = await handler.execute('v1', {
      id: 'sa-1',
      email: 'sa@x.com',
    });

    expect(result.ownerships[0].user.email).toBe('o@x.com');
  });

  it('omits emails when no user context is provided', async () => {
    prismaMock.vehicle.findUnique.mockResolvedValue({ id: 'v1' });
    prismaMock.vehicleOwnership.findMany.mockResolvedValue([
      {
        startsAt: new Date(),
        user: { id: 'owner-1', firstName: 'X', lastName: 'Y' },
      },
    ]);
    prismaMock.vehicleTransfer.findMany.mockResolvedValue([]);
    prismaMock.vehicleMileage.findMany.mockResolvedValue([]);

    const result = await handler.execute('v1');

    const findManyArg = prismaMock.vehicleOwnership.findMany.mock.calls[0][0];
    expect(findManyArg.include.user.select).not.toHaveProperty('email');
  });
});