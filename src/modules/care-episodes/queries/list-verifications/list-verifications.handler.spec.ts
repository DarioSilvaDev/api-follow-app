import { ListVerificationsHandler } from './list-verifications.handler';

describe('ListVerificationsHandler — RF-4 workshop verification queue', () => {
  let handler: ListVerificationsHandler;
  let prismaMock: { careEpisode: { findMany: jest.Mock } };

  const workshopId = 'w-1';

  beforeEach(() => {
    prismaMock = {
      careEpisode: { findMany: jest.fn().mockResolvedValue([]) },
    };
    handler = new ListVerificationsHandler(prismaMock as any);
  });

  it('queries only owner + unverified episodes of the context workshop, oldest first', async () => {
    await handler.execute(workshopId);

    expect(prismaMock.careEpisode.findMany).toHaveBeenCalledWith({
      where: {
        workshopId,
        source: 'owner',
        verification: 'unverified',
      },
      select: expect.anything(),
      orderBy: { serviceDate: 'asc' },
      take: 50,
    });
  });

  it('clamps the limit between 1 and 100 and defaults to 50', async () => {
    await handler.execute(workshopId);
    expect(prismaMock.careEpisode.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 50 }),
    );

    await handler.execute(workshopId, 9999);
    expect(prismaMock.careEpisode.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ take: 100 }),
    );

    await handler.execute(workshopId, 0);
    expect(prismaMock.careEpisode.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ take: 1 }),
    );
  });

  it('never exposes owner email/phone and keeps only firstName/lastName', async () => {
    prismaMock.careEpisode.findMany.mockResolvedValue([
      {
        id: 'ce-1',
        title: 'Cambio de aceite',
        serviceDate: new Date('2026-09-10T10:00:00.000Z'),
        mileageIn: 45200,
        customerNotes: 'Hace ruido al frenar',
        vehicle: {
          licensePlate: 'ABC-123',
          manufactureYear: 2020,
          version: {
            name: 'Corolla',
            model: { name: 'Corolla', brand: { name: 'Toyota' } },
          },
          ownerships: [
            {
              user: { firstName: 'Juan', lastName: 'Pérez' },
            },
          ],
        },
      },
    ]);

    const result = await handler.execute(workshopId);

    expect(result).toEqual([
      {
        id: 'ce-1',
        title: 'Cambio de aceite',
        serviceDate: new Date('2026-09-10T10:00:00.000Z'),
        mileageIn: 45200,
        notes: 'Hace ruido al frenar',
        vehicle: {
          licensePlate: 'ABC-123',
          brand: 'Toyota',
          model: 'Corolla',
          version: 'Corolla',
          manufactureYear: 2020,
        },
        owner: { firstName: 'Juan', lastName: 'Pérez' },
      },
    ]);
    expect(JSON.stringify(result)).not.toContain('@');
    expect(JSON.stringify(result)).not.toContain('email');
  });

  it('returns null-safe fields when there is no owner or catalog info', async () => {
    prismaMock.careEpisode.findMany.mockResolvedValue([
      {
        id: 'ce-2',
        title: null,
        serviceDate: null,
        mileageIn: null,
        customerNotes: null,
        vehicle: {
          licensePlate: 'XYZ-999',
          manufactureYear: null,
          version: null,
          ownerships: [],
        },
      },
    ]);

    const result = await handler.execute(workshopId);

    expect(result).toEqual([
      {
        id: 'ce-2',
        title: null,
        serviceDate: null,
        mileageIn: null,
        notes: null,
        vehicle: {
          licensePlate: 'XYZ-999',
          brand: null,
          model: null,
          version: null,
          manufactureYear: null,
        },
        owner: { firstName: null, lastName: null },
      },
    ]);
  });
});
