import { GetVehicleHistoryHandler } from './get-vehicle-history.handler';
import { AuthenticatedUser } from '../../../../common/types/auth.types';

describe('GetVehicleHistoryHandler — PII in history (Security Review #13)', () => {
  let handler: GetVehicleHistoryHandler;
  let prismaMock: {
    vehicle: { findUnique: jest.Mock };
    vehicleOwnership: { findFirst: jest.Mock; findMany: jest.Mock };
    vehicleTransfer: { findMany: jest.Mock };
    vehicleMileage: { findMany: jest.Mock };
    careEpisode: { findMany: jest.Mock };
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
      careEpisode: { findMany: jest.fn() },
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
    prismaMock.careEpisode.findMany.mockResolvedValue([]);

    const result = await handler.execute('v1', holderUser);

    // The Prisma select must NOT request email for a non-owner holder, but
    // must include alias (D-078 — alias is public, not PII).
    const findManyArg = prismaMock.vehicleOwnership.findMany.mock.calls[0][0];
    expect(findManyArg.include.user.select).not.toHaveProperty('email');
    expect(findManyArg.include.user.select).toEqual({
      id: true,
      firstName: true,
      lastName: true,
      alias: true,
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
    prismaMock.careEpisode.findMany.mockResolvedValue([]);

    const result = await handler.execute('v1', ownerUser);

    const findManyArg = prismaMock.vehicleOwnership.findMany.mock.calls[0][0];
    expect(findManyArg.include.user.select).toEqual({
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      alias: true,
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
    prismaMock.careEpisode.findMany.mockResolvedValue([]);

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
    prismaMock.careEpisode.findMany.mockResolvedValue([]);

    const result = await handler.execute('v1');

    const findManyArg = prismaMock.vehicleOwnership.findMany.mock.calls[0][0];
    expect(findManyArg.include.user.select).not.toHaveProperty('email');
  });

  // --- CareEpisode tests (iteration 2-3) ---

  it('sorts careEpisodes by D-070 canonical timestamp desc with mixed nulls and tiebreak', async () => {
    prismaMock.vehicle.findUnique.mockResolvedValue({ id: 'v1' });
    prismaMock.vehicleOwnership.findFirst.mockResolvedValue(null);
    prismaMock.systemRole.findUnique.mockResolvedValue(null);
    prismaMock.vehicleOwnership.findMany.mockResolvedValue([]);
    prismaMock.vehicleTransfer.findMany.mockResolvedValue([]);
    prismaMock.vehicleMileage.findMany.mockResolvedValue([]);

    // Fixture: three episodes exercising all three branches of the coalesce key
    // and a tiebreak scenario.
    const epA = {
      id: 'ep-a',
      title: 'A',
      serviceDate: new Date('2025-03-01T00:00:00.000Z'), // key = serviceDate
      status: 'delivered',
      source: 'owner',
      verification: 'unverified',
      mileageIn: null,
      customerNotes: null,
      checkedInAt: null,
      createdAt: new Date('2025-02-28T10:00:00.000Z'),
      workshopName: null,
      workshop: null,
    };
    const epB = {
      id: 'ep-b',
      title: 'B',
      serviceDate: null, // key = checkedInAt (serviceDate null)
      status: 'open',
      source: 'workshop',
      verification: 'unverified',
      mileageIn: 1000,
      customerNotes: null,
      checkedInAt: new Date('2025-06-15T08:00:00.000Z'),
      createdAt: new Date('2025-06-14T12:00:00.000Z'),
      workshopName: 'Taller B',
      workshop: { id: 'w-b', name: 'Taller B' },
    };
    const epC = {
      id: 'ep-c',
      title: 'C',
      serviceDate: null, // key = createdAt (both serviceDate & checkedInAt null)
      status: 'open',
      source: 'owner',
      verification: 'unverified',
      mileageIn: null,
      customerNotes: null,
      checkedInAt: null,
      createdAt: new Date('2025-09-01T00:00:00.000Z'),
      workshopName: null,
      workshop: null,
    };
    // epD shares the same canonical key as epB to exercise tiebreak
    const epD = {
      id: 'ep-d',
      title: 'D',
      serviceDate: null,
      status: 'delivered',
      source: 'owner',
      verification: 'verified',
      mileageIn: null,
      customerNotes: 'note',
      checkedInAt: new Date('2025-06-15T08:00:00.000Z'), // same key as epB
      createdAt: new Date('2025-06-15T09:00:00.000Z'), // later createdAt → should come before epB
      workshopName: null,
      workshop: null,
    };

    // Prisma returns in arbitrary order; the handler sorts.
    prismaMock.careEpisode.findMany.mockResolvedValue([epA, epD, epB, epC]);

    const result = await handler.execute('v1');

    // Expected desc order: epC (Sep 1) > epD (Jun 15, tiebreak later) > epB (Jun 15) > epA (Mar 1)
    expect(result.careEpisodes.map((e: any) => e.id)).toEqual([
      'ep-c',
      'ep-d',
      'ep-b',
      'ep-a',
    ]);
  });

  it('careEpisode select excludes sensitive keys (internalNotes, customerComplaint, etc.)', async () => {
    prismaMock.vehicle.findUnique.mockResolvedValue({ id: 'v1' });
    prismaMock.vehicleOwnership.findFirst.mockResolvedValue(null);
    prismaMock.systemRole.findUnique.mockResolvedValue(null);
    prismaMock.vehicleOwnership.findMany.mockResolvedValue([]);
    prismaMock.vehicleTransfer.findMany.mockResolvedValue([]);
    prismaMock.vehicleMileage.findMany.mockResolvedValue([]);
    prismaMock.careEpisode.findMany.mockResolvedValue([]);

    await handler.execute('v1');

    const findManyArg = prismaMock.careEpisode.findMany.mock.calls[0][0];
    const selectKeys = Object.keys(findManyArg.select);

    // Must NOT contain any of the excluded keys
    const excluded = [
      'internalNotes',
      'customerComplaint',
      'closedAt',
      'updatedAt',
      'createdByUserId',
      'createdByMemberId',
      'verifiedByMemberId',
      'verifiedAt',
      'branchId',
      'appointmentId',
      'vehicleId',
    ];
    for (const key of excluded) {
      expect(selectKeys).not.toContain(key);
    }

    // Must contain the expected keys
    const expected = [
      'id', 'title', 'serviceDate', 'status', 'source', 'verification',
      'mileageIn', 'customerNotes', 'checkedInAt', 'createdAt',
      'workshopName', 'workshop',
    ];
    for (const key of expected) {
      expect(selectKeys).toContain(key);
    }
  });

  it('careEpisode workshop shape is { id, name }', async () => {
    prismaMock.vehicle.findUnique.mockResolvedValue({ id: 'v1' });
    prismaMock.vehicleOwnership.findFirst.mockResolvedValue(null);
    prismaMock.systemRole.findUnique.mockResolvedValue(null);
    prismaMock.vehicleOwnership.findMany.mockResolvedValue([]);
    prismaMock.vehicleTransfer.findMany.mockResolvedValue([]);
    prismaMock.vehicleMileage.findMany.mockResolvedValue([]);
    prismaMock.careEpisode.findMany.mockResolvedValue([
      {
        id: 'ep-1',
        title: 'Service',
        serviceDate: new Date('2025-01-01'),
        status: 'open',
        source: 'workshop',
        verification: 'unverified',
        mileageIn: 50000,
        customerNotes: null,
        checkedInAt: null,
        createdAt: new Date('2025-01-01'),
        workshopName: 'Taller X',
        workshop: { id: 'w-1', name: 'Taller X' },
      },
    ]);

    const result = await handler.execute('v1');

    expect(result.careEpisodes[0].workshop).toEqual({ id: 'w-1', name: 'Taller X' });
  });

  it('includes careEpisodes with status cancelled in the result', async () => {
    prismaMock.vehicle.findUnique.mockResolvedValue({ id: 'v1' });
    prismaMock.vehicleOwnership.findFirst.mockResolvedValue(null);
    prismaMock.systemRole.findUnique.mockResolvedValue(null);
    prismaMock.vehicleOwnership.findMany.mockResolvedValue([]);
    prismaMock.vehicleTransfer.findMany.mockResolvedValue([]);
    prismaMock.vehicleMileage.findMany.mockResolvedValue([]);
    prismaMock.careEpisode.findMany.mockResolvedValue([
      {
        id: 'ep-open',
        title: 'Open',
        serviceDate: new Date('2025-06-01'),
        status: 'open',
        source: 'owner',
        verification: 'unverified',
        mileageIn: null,
        customerNotes: null,
        checkedInAt: null,
        createdAt: new Date('2025-06-01'),
        workshopName: null,
        workshop: null,
      },
      {
        id: 'ep-cancelled',
        title: 'Cancelled',
        serviceDate: new Date('2025-05-01'),
        status: 'cancelled',
        source: 'workshop',
        verification: 'unverified',
        mileageIn: null,
        customerNotes: null,
        checkedInAt: null,
        createdAt: new Date('2025-05-01'),
        workshopName: 'Taller Y',
        workshop: { id: 'w-2', name: 'Taller Y' },
      },
      {
        id: 'ep-delivered',
        title: 'Delivered',
        serviceDate: new Date('2025-07-01'),
        status: 'delivered',
        source: 'owner',
        verification: 'verified',
        mileageIn: 10000,
        customerNotes: 'All good',
        checkedInAt: null,
        createdAt: new Date('2025-07-01'),
        workshopName: null,
        workshop: null,
      },
    ]);

    const result = await handler.execute('v1');

    // All three statuses are present — no filtering by status
    expect(result.careEpisodes).toHaveLength(3);
    expect(result.careEpisodes.map((e: any) => e.id)).toContain('ep-cancelled');
    expect(result.careEpisodes.map((e: any) => e.id)).toContain('ep-open');
    expect(result.careEpisodes.map((e: any) => e.id)).toContain('ep-delivered');
  });
});