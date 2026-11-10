import { ListServiceTypesHandler } from './list-service-types.handler';

describe('ListServiceTypesHandler — B-2 catálogo de tipos de atención', () => {
  let handler: ListServiceTypesHandler;
  let prismaMock: {
    workshopSpecialty: { findMany: jest.Mock };
    serviceType: { findMany: jest.Mock };
  };

  const workshopId = 'w1';

  const catalog = [
    { id: 'st-1', code: 'oil_change', name: 'Cambio de aceite' },
    { id: 'st-2', code: 'brakes', name: 'Frenos' },
  ];

  beforeEach(() => {
    prismaMock = {
      workshopSpecialty: { findMany: jest.fn() },
      serviceType: { findMany: jest.fn() },
    };
    handler = new ListServiceTypesHandler(prismaMock as any);
    prismaMock.workshopSpecialty.findMany.mockResolvedValue([]);
    prismaMock.serviceType.findMany.mockResolvedValue(catalog);
  });

  it('sin especialidades devuelve el catálogo completo con onboardingRequired: true', async () => {
    const result = await handler.execute(workshopId);

    expect(result).toEqual({ data: catalog, onboardingRequired: true });
    expect(prismaMock.serviceType.findMany).toHaveBeenCalledWith({
      where: { isActive: true },
      select: { id: true, code: true, name: true },
      orderBy: { name: 'asc' },
    });
  });

  it('con especialidades filtra por la unión de specialtyId del taller', async () => {
    prismaMock.workshopSpecialty.findMany.mockResolvedValue([
      { specialtyId: 'sp-1' },
      { specialtyId: 'sp-2' },
    ]);

    const result = await handler.execute(workshopId);

    expect(result.onboardingRequired).toBe(false);
    expect(prismaMock.workshopSpecialty.findMany).toHaveBeenCalledWith({
      where: { workshopId },
      select: { specialtyId: true },
    });
    expect(prismaMock.serviceType.findMany).toHaveBeenCalledWith({
      where: {
        isActive: true,
        specialties: { some: { specialtyId: { in: ['sp-1', 'sp-2'] } } },
      },
      select: { id: true, code: true, name: true },
      orderBy: { name: 'asc' },
    });
  });

  it('siempre filtra por isActive en el catálogo (con y sin especialidades)', async () => {
    await handler.execute(workshopId);
    prismaMock.workshopSpecialty.findMany.mockResolvedValue([
      { specialtyId: 'sp-1' },
    ]);
    await handler.execute(workshopId);

    for (const call of prismaMock.serviceType.findMany.mock.calls) {
      expect(call[0].where.isActive).toBe(true);
    }
  });

  it('consulta las especialidades del taller del contexto (no de otro)', async () => {
    await handler.execute(workshopId);

    expect(prismaMock.workshopSpecialty.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { workshopId } }),
    );
  });

  it('devuelve lista vacía sin onboarding cuando el filtro no matchea nada', async () => {
    prismaMock.workshopSpecialty.findMany.mockResolvedValue([
      { specialtyId: 'sp-9' },
    ]);
    prismaMock.serviceType.findMany.mockResolvedValue([]);

    const result = await handler.execute(workshopId);

    expect(result).toEqual({ data: [], onboardingRequired: false });
  });
});
