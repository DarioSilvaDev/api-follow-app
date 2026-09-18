import { ListVehiclesHandler } from './list-vehicles.handler';

describe('ListVehiclesHandler — stable list contract (F-010)', () => {
  let handler: ListVehiclesHandler;
  let prismaMock: {
    vehicle: { findMany: jest.Mock; count: jest.Mock };
  };

  const rawVehicle = (overrides: Record<string, unknown> = {}) => ({
    id: 'v1',
    licensePlate: 'ABC123',
    vin: null,
    engineNumber: null,
    versionId: 'version-1',
    manufactureYear: 2020,
    modelYear: 2021,
    color: 'Negro',
    notes: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    version: {
      id: 'version-1',
      name: '1.6 SE',
      productionFrom: null,
      productionTo: null,
      engineCode: null,
      engineDisplacement: null,
      horsepower: null,
      fuelType: 'gasoline',
      transmission: 'manual',
      bodyType: 'sedan',
      doors: null,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      model: {
        id: 'model-1',
        name: 'Civic',
        slug: 'civic',
        isActive: true,
        createdAt: new Date('2026-01-01T00:00:00Z'),
        brand: {
          id: 'brand-1',
          name: 'Honda',
          slug: 'honda',
          logoUrl: null,
          isActive: true,
          createdAt: new Date('2026-01-01T00:00:00Z'),
        },
      },
    },
    ownerships: [
      {
        id: 'own-1',
        vehicleId: 'v1',
        userId: 'user-1',
        type: 'owner',
        startsAt: new Date(),
        endsAt: null,
        createdAt: new Date(),
        user: { id: 'user-1', firstName: 'Ana', lastName: 'Pérez' },
      },
    ],
    photos: [
      {
        id: 'p1',
        vehicleId: 'v1',
        key: 'key-1',
        caption: null,
        isPrimary: true,
        createdAt: new Date(),
      },
    ],
    ...overrides,
  });

  beforeEach(() => {
    prismaMock = {
      vehicle: { findMany: jest.fn(), count: jest.fn() },
    };
    handler = new ListVehiclesHandler(prismaMock as any);
  });

  it('returns VehicleResponseDto-shaped items (brand/model/version) + meta', async () => {
    prismaMock.vehicle.findMany.mockResolvedValue([rawVehicle()]);
    prismaMock.vehicle.count.mockResolvedValue(1);

    const result = await handler.execute({
      userId: 'user-1',
      page: 1,
      limit: 20,
    });

    expect(prismaMock.vehicle.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        // M5 (§30 §3): scope = ownership activo O VehicleAccess vigente.
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            { ownerships: { some: { userId: 'user-1', endsAt: null } } },
            expect.objectContaining({
              accesses: {
                some: expect.objectContaining({
                  userId: 'user-1',
                  revokedAt: null,
                }),
              },
            }),
          ]),
        }),
      }),
    );

    expect(result.meta).toEqual({
      total: 1,
      page: 1,
      limit: 20,
      totalPages: 1,
    });
    expect(result.data).toHaveLength(1);

    const item = result.data[0];
    expect(item).toEqual(
      expect.objectContaining({
        id: 'v1',
        licensePlate: 'ABC123',
        brand: 'Honda',
        model: 'Civic',
        version: '1.6 SE',
        photos: expect.any(Array),
        ownerships: expect.any(Array),
      }),
    );
    // No se filtra el grafo raw de Prisma: no hay objeto `version` anidado.
    expect(item).not.toHaveProperty('version.model');
  });

  it('maps vehicles without version to brand/model/version null (D-038)', async () => {
    prismaMock.vehicle.findMany.mockResolvedValue([
      rawVehicle({ versionId: null, version: null }),
    ]);
    prismaMock.vehicle.count.mockResolvedValue(1);

    const result = await handler.execute({ userId: 'user-1' });

    expect(result.data[0]).toEqual(
      expect.objectContaining({
        versionId: null,
        brand: null,
        model: null,
        version: null,
      }),
    );
  });

  it('computes pagination meta and clamps limits', async () => {
    prismaMock.vehicle.findMany.mockResolvedValue([]);
    prismaMock.vehicle.count.mockResolvedValue(12);

    const result = await handler.execute({
      userId: 'user-1',
      page: 2,
      limit: 5,
    });

    expect(prismaMock.vehicle.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 5, take: 5 }),
    );
    expect(result.meta).toEqual({
      total: 12,
      page: 2,
      limit: 5,
      totalPages: 3,
    });
  });

  describe('F-012 — búsqueda por placa (q)', () => {
    it('combina el filtro de placa con el scope de ownership vía AND', async () => {
      prismaMock.vehicle.findMany.mockResolvedValue([rawVehicle()]);
      prismaMock.vehicle.count.mockResolvedValue(1);

      await handler.execute({ userId: 'user-1', page: 1, limit: 20, q: 'SMK' });

      expect(prismaMock.vehicle.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              { ownerships: { some: { userId: 'user-1', endsAt: null } } },
            ]),
            licensePlate: { contains: 'SMK', mode: 'insensitive' },
          }),
        }),
      );
    });

    it('q en minúsculas → mode insensitive presente', async () => {
      prismaMock.vehicle.findMany.mockResolvedValue([]);
      prismaMock.vehicle.count.mockResolvedValue(0);

      await handler.execute({ userId: 'user-1', q: 'smk' });

      const arg = prismaMock.vehicle.findMany.mock.calls[0][0];
      expect(arg.where.licensePlate).toEqual({
        contains: 'smk',
        mode: 'insensitive',
      });
    });

    it('q con espacios → contains con trim aplicado', async () => {
      prismaMock.vehicle.findMany.mockResolvedValue([]);
      prismaMock.vehicle.count.mockResolvedValue(0);

      await handler.execute({ userId: 'user-1', q: '  SMK  ' });

      const arg = prismaMock.vehicle.findMany.mock.calls[0][0];
      expect(arg.where.licensePlate).toEqual({
        contains: 'SMK',
        mode: 'insensitive',
      });
    });

    it('q con menos de 2 caracteres o vacío → where idéntico al actual (regresión)', async () => {
      prismaMock.vehicle.findMany.mockResolvedValue([]);
      prismaMock.vehicle.count.mockResolvedValue(0);

      for (const q of ['A', '', '   ']) {
        prismaMock.vehicle.findMany.mockClear();

        await handler.execute({ userId: 'user-1', q });

        const arg = prismaMock.vehicle.findMany.mock.calls[0][0];
        expect(arg.where.OR).toContainEqual({
          ownerships: { some: { userId: 'user-1', endsAt: null } },
        });
        expect(arg.where.OR).toHaveLength(2);
        expect(arg.where).not.toHaveProperty('licensePlate');
      }
    });

    it('q no-string (query repetida ?q=a&q=b) → no crash, sin filtro', async () => {
      prismaMock.vehicle.findMany.mockResolvedValue([]);
      prismaMock.vehicle.count.mockResolvedValue(0);

      await expect(
        handler.execute({ userId: 'user-1', q: ['a', 'b'] as any }),
      ).resolves.toBeDefined();

      const arg = prismaMock.vehicle.findMany.mock.calls[0][0];
      expect(arg.where.OR).toContainEqual({
        ownerships: { some: { userId: 'user-1', endsAt: null } },
      });
      expect(arg.where.OR).toHaveLength(2);
      expect(arg.where.OR).toContainEqual(
        expect.objectContaining({
          accesses: {
            some: expect.objectContaining({
              userId: 'user-1',
              revokedAt: null,
            }),
          },
        }),
      );
      expect(arg.where).not.toHaveProperty('licensePlate');
    });

    it('q sin coincidencias → data vacía y meta.total 0 (count con mismo where)', async () => {
      prismaMock.vehicle.findMany.mockResolvedValue([]);
      prismaMock.vehicle.count.mockResolvedValue(0);

      const result = await handler.execute({ userId: 'user-1', q: 'ZZZ' });

      expect(result.data).toEqual([]);
      expect(result.meta.total).toBe(0);
      expect(prismaMock.vehicle.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            licensePlate: { contains: 'ZZZ', mode: 'insensitive' },
          }),
        }),
      );
    });
  });

  describe('M5 — VehicleAccess vigente (consignación)', () => {
    it('incluye el scope de accesses sin revocar y con expiración activa', async () => {
      prismaMock.vehicle.findMany.mockResolvedValue([rawVehicle()]);
      prismaMock.vehicle.count.mockResolvedValue(1);

      await handler.execute({ userId: 'seller-1' });

      const arg = prismaMock.vehicle.findMany.mock.calls[0][0];
      const accessScope = arg.where.OR.find((o: any) => o.accesses);
      expect(accessScope.accesses.some).toEqual(
        expect.objectContaining({
          userId: 'seller-1',
          revokedAt: null,
          OR: [{ expiresAt: null }, { expiresAt: { gt: expect.any(Date) } }],
        }),
      );
    });
  });
});
