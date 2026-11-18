import { ListUsersHandler } from './list-users.handler';

/**
 * P5: orden "pendientes primero" — status asc (orden de declaración del
 * enum en PG: pending antes que active/suspended) + createdAt desc.
 */
describe('ListUsersHandler — P5 orden pendientes primero', () => {
  let handler: ListUsersHandler;
  let prismaMock: any;

  beforeEach(() => {
    prismaMock = {
      user: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    };
    handler = new ListUsersHandler(prismaMock);
  });

  it('ordena por status asc (pendientes primero) y createdAt desc', async () => {
    await handler.execute({});

    expect(prismaMock.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      }),
    );
  });
});

/**
 * Panel superadmin: filtro `membership` (vínculo del usuario con el
 * ecosistema) y conteos por usuario (talleres / concesionarias / vehículos)
 * para las columnas de la tabla.
 */
describe('ListUsersHandler — membership filter y conteos', () => {
  let handler: ListUsersHandler;
  let prismaMock: any;

  beforeEach(() => {
    prismaMock = {
      user: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      workshopMember: {
        groupBy: jest.fn().mockResolvedValue([]),
      },
      dealershipMember: {
        groupBy: jest.fn().mockResolvedValue([]),
      },
      vehicleOwnership: {
        groupBy: jest.fn().mockResolvedValue([]),
      },
    };
    handler = new ListUsersHandler(prismaMock);
  });

  it('membership=workshop filtra por membresía de taller activa', async () => {
    await handler.execute({ membership: 'workshop' });

    expect(prismaMock.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workshopMemberships: { some: { status: 'active' } },
        }),
      }),
    );
  });

  it('membership=dealership filtra por membresía de concesionaria activa', async () => {
    await handler.execute({ membership: 'dealership' });

    expect(prismaMock.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          dealershipMemberships: { some: { status: 'active' } },
        }),
      }),
    );
  });

  it('membership=vehicle filtra por tenencia vigente', async () => {
    await handler.execute({ membership: 'vehicle' });

    expect(prismaMock.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          ownerships: { some: { endsAt: null } },
        }),
      }),
    );
  });

  it('membership=none excluye talleres, concesionarias y vehículos', async () => {
    await handler.execute({ membership: 'none' });

    expect(prismaMock.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            { workshopMemberships: { none: { status: 'active' } } },
            { dealershipMemberships: { none: { status: 'active' } } },
            { ownerships: { none: { endsAt: null } } },
          ]),
        }),
      }),
    );
  });

  it('membership inválida devuelve 400', async () => {
    await expect(handler.execute({ membership: 'banana' })).rejects.toThrow(
      'El filtro membership debe ser uno de: workshop, dealership, vehicle, none',
    );
  });

  it('adjunta conteos por usuario (talleres, concesionarias, vehículos)', async () => {
    prismaMock.user.findMany.mockResolvedValue([{ id: 'u1' }, { id: 'u2' }]);
    prismaMock.workshopMember.groupBy.mockResolvedValue([
      { userId: 'u1', _count: { _all: 2 } },
    ]);
    prismaMock.dealershipMember.groupBy.mockResolvedValue([
      { userId: 'u1', _count: { _all: 1 } },
    ]);
    prismaMock.vehicleOwnership.groupBy.mockResolvedValue([
      { userId: 'u2', _count: { _all: 3 } },
    ]);

    const result = await handler.execute({});

    expect(result.data).toEqual([
      expect.objectContaining({
        id: 'u1',
        _counts: { workshops: 2, dealerships: 1, vehicles: 0 },
      }),
      expect.objectContaining({
        id: 'u2',
        _counts: { workshops: 0, dealerships: 0, vehicles: 3 },
      }),
    ]);
  });
});
