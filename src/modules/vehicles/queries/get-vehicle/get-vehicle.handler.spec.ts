import { NotFoundException } from '@nestjs/common';
import { GetVehicleHandler } from './get-vehicle.handler';
import { AuthenticatedUser } from '../../../../common/types/auth.types';

describe('GetVehicleHandler — FIX-PII (§34) email exposure in vehicle detail', () => {
  let handler: GetVehicleHandler;
  let prismaMock: {
    vehicle: { findUnique: jest.Mock };
    vehicleOwnership: { findFirst: jest.Mock };
    systemRole: { findUnique: jest.Mock };
    systemRoleAssignment: { findFirst: jest.Mock };
  };

  const ownerUser: AuthenticatedUser = {
    id: 'owner-1',
    email: 'owner@example.com',
  };
  const sharedUser: AuthenticatedUser = {
    id: 'shared-1',
    email: 'shared@example.com',
  };
  const dealershipMemberUser: AuthenticatedUser = {
    id: 'member-1',
    email: 'member@example.com',
  };
  const superAdminUser: AuthenticatedUser = {
    id: 'super-admin-1',
    email: 'superadmin@example.com',
  };

  const vehicleRow = {
    id: 'v1',
    licensePlate: 'ABC123',
    vin: null,
    engineNumber: null,
    versionId: 'ver-1',
    modelId: 'm-1',
    brandId: 'b-1',
    manufactureYear: 2018,
    modelYear: 2019,
    color: 'Rojo',
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    version: {
      id: 'ver-1',
      name: '1.8 SE',
      model: {
        id: 'm-1',
        name: 'Corolla',
        brand: { id: 'b-1', name: 'Toyota' },
      },
    },
    ownerships: [
      {
        id: 'own-1',
        vehicleId: 'v1',
        userId: 'owner-1',
        type: 'owner',
        startsAt: new Date(),
        endsAt: null,
        user: {
          id: 'owner-1',
          firstName: 'X',
          lastName: 'Y',
          alias: 'xalias',
          email: 'owner@example.com',
        },
        dealership: null,
      },
    ],
    photos: [],
    documents: [],
    mileages: [],
  };

  beforeEach(() => {
    prismaMock = {
      vehicle: { findUnique: jest.fn() },
      vehicleOwnership: { findFirst: jest.fn() },
      systemRole: { findUnique: jest.fn() },
      systemRoleAssignment: { findFirst: jest.fn() },
    };
    handler = new GetVehicleHandler(prismaMock as any);
  });

  const ownershipUserSelect = () =>
    prismaMock.vehicle.findUnique.mock.calls[0][0].include.ownerships.include
      .user.select;

  const mockOwner = () =>
    prismaMock.vehicleOwnership.findFirst.mockResolvedValue({
      id: 'own-1',
    });
  const mockNonOwnerNonSuperAdmin = () => {
    prismaMock.vehicleOwnership.findFirst.mockResolvedValue(null);
    prismaMock.systemRole.findUnique.mockResolvedValue({ id: 'super-role' });
    prismaMock.systemRoleAssignment.findFirst.mockResolvedValue(null);
  };
  const mockSuperAdmin = () => {
    prismaMock.vehicleOwnership.findFirst.mockResolvedValue(null);
    prismaMock.systemRole.findUnique.mockResolvedValue({ id: 'super-role' });
    prismaMock.systemRoleAssignment.findFirst.mockResolvedValue({
      id: 'assignment-1',
    });
  };

  const runDetail = () =>
    prismaMock.vehicle.findUnique.mockResolvedValue(vehicleRow);

  it('owner activo (persona) ve el email en ownerships', async () => {
    mockOwner();
    runDetail();

    await handler.execute('v1', ownerUser);

    expect(ownershipUserSelect()).toEqual({
      id: true,
      firstName: true,
      lastName: true,
      alias: true,
      email: true,
    });
  });

  it('rama DEALERSHIP (miembro titular, sin ownership persona) NO ve email', async () => {
    mockNonOwnerNonSuperAdmin();
    runDetail();

    await handler.execute('v1', dealershipMemberUser);

    expect(ownershipUserSelect()).toEqual({
      id: true,
      firstName: true,
      lastName: true,
      alias: true,
    });
    expect(ownershipUserSelect()).not.toHaveProperty('email');
  });

  it('shared-access NO ve email (mismo criterio que el history)', async () => {
    mockNonOwnerNonSuperAdmin();
    runDetail();

    await handler.execute('v1', sharedUser);

    expect(ownershipUserSelect()).toEqual({
      id: true,
      firstName: true,
      lastName: true,
      alias: true,
    });
    expect(ownershipUserSelect()).not.toHaveProperty('email');
  });

  it('super_admin ve email aunque no sea owner', async () => {
    mockSuperAdmin();
    runDetail();

    await handler.execute('v1', superAdminUser);

    expect(ownershipUserSelect()).toEqual({
      id: true,
      firstName: true,
      lastName: true,
      alias: true,
      email: true,
    });
  });

  it('sin caller (defensa en profundidad) → sin email', async () => {
    mockNonOwnerNonSuperAdmin();
    runDetail();

    await handler.execute('v1');

    expect(ownershipUserSelect()).not.toHaveProperty('email');
  });

  it('B1/D-107: ownership include expone dealership (sin PII de empleados) en detalle', async () => {
    mockOwner();
    runDetail();

    await handler.execute('v1', ownerUser);

    const include = prismaMock.vehicle.findUnique.mock.calls[0][0].include;
    expect(include.ownerships.include.dealership).toEqual({
      select: { id: true, name: true, logoUrl: true },
    });
  });

  it('404 para vehículo desconocido', async () => {
    mockOwner();
    prismaMock.vehicle.findUnique.mockResolvedValue(null);

    let thrown: any;
    try {
      await handler.execute('unknown', ownerUser);
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(NotFoundException);
  });
});
