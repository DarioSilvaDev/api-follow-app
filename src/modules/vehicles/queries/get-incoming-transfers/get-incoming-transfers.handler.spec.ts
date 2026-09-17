import { GetIncomingTransfersHandler } from './get-incoming-transfers.handler';

describe('GetIncomingTransfersHandler — D-078 symmetric contract (no PII)', () => {
  let handler: GetIncomingTransfersHandler;
  let prismaMock: {
    vehicleTransfer: { findMany: jest.Mock };
  };

  const vehicle = {
    id: 'v1',
    licensePlate: 'ABC123',
    manufactureYear: 2018,
    modelYear: 2019,
    color: 'Rojo',
  };

  const baseTransfer = {
    id: 't1',
    status: 'pending',
    requestedAt: new Date('2026-01-01T00:00:00.000Z'),
    expiresAt: new Date('2026-01-08T00:00:00.000Z'),
    notes: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    vehicle,
  };

  beforeEach(() => {
    prismaMock = {
      vehicleTransfer: { findMany: jest.fn() },
    };
    handler = new GetIncomingTransfersHandler(prismaMock as any);
  });

  it('passes through fromUser/toUser with symmetric { id, firstName, lastName, alias }', async () => {
    prismaMock.vehicleTransfer.findMany.mockResolvedValue([
      {
        ...baseTransfer,
        fromUser: {
          id: 'u-ana',
          firstName: 'Ana',
          lastName: 'Pérez',
          alias: 'ana_p',
        },
        toUser: { id: 'u-yo', firstName: 'Yo', lastName: 'Mismo', alias: null },
      },
    ]);

    const result = await handler.execute('u-yo');

    expect(result).toHaveLength(1);
    expect(result[0].fromUser).toEqual({
      id: 'u-ana',
      firstName: 'Ana',
      lastName: 'Pérez',
      alias: 'ana_p',
    });
    expect(result[0].toUser).toEqual({
      id: 'u-yo',
      firstName: 'Yo',
      lastName: 'Mismo',
      alias: null,
    });
    // Vehicle shape is preserved unchanged.
    expect(result[0].vehicle).toEqual(vehicle);
  });

  it('requests alias in the Prisma select and never requests email ({ id, firstName, lastName, alias })', async () => {
    prismaMock.vehicleTransfer.findMany.mockResolvedValue([]);

    await handler.execute('u-yo');

    const arg = prismaMock.vehicleTransfer.findMany.mock.calls[0][0];
    expect(arg.include.fromUser.select).toEqual({
      id: true,
      firstName: true,
      lastName: true,
      alias: true,
    });
    expect(arg.include.toUser.select).toEqual({
      id: true,
      firstName: true,
      lastName: true,
      alias: true,
    });
    expect(arg.include.fromUser.select).not.toHaveProperty('email');
    expect(arg.include.toUser.select).not.toHaveProperty('email');
    // Vehicle select stays unchanged.
    expect(arg.include.vehicle.select).toEqual({
      id: true,
      licensePlate: true,
      manufactureYear: true,
      modelYear: true,
      color: true,
    });
  });

  it('does not expose email of any user in the result', async () => {
    prismaMock.vehicleTransfer.findMany.mockResolvedValue([
      {
        ...baseTransfer,
        fromUser: {
          id: 'u-ana',
          firstName: 'Ana',
          lastName: 'Pérez',
          alias: null,
        },
        toUser: { id: 'u-yo', firstName: 'Yo', lastName: 'Mismo', alias: null },
      },
    ]);

    const result = await handler.execute('u-yo');

    expect(JSON.stringify(result)).not.toMatch(/email/i);
  });

  it('returns [] when there are no transfers', async () => {
    prismaMock.vehicleTransfer.findMany.mockResolvedValue([]);

    const result = await handler.execute('u-yo');

    expect(result).toEqual([]);
  });

  it('filters by toUserId and orders by createdAt desc', async () => {
    prismaMock.vehicleTransfer.findMany.mockResolvedValue([]);

    await handler.execute('u-yo');

    const arg = prismaMock.vehicleTransfer.findMany.mock.calls[0][0];
    expect(arg.where).toEqual({ toUserId: 'u-yo' });
    expect(arg.orderBy).toEqual({ createdAt: 'desc' });
  });
});
