import { BadRequestException } from '@nestjs/common';
import { ListWorkshopCatalogHandler } from './list-workshop-catalog.handler';

describe('ListWorkshopCatalogHandler — catálogo público paginado de talleres', () => {
  let handler: ListWorkshopCatalogHandler;
  let prismaMock: {
    workshop: { findMany: jest.Mock; count: jest.Mock };
  };

  beforeEach(() => {
    prismaMock = {
      workshop: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    };
    handler = new ListWorkshopCatalogHandler(prismaMock as any);
  });

  it('devuelve la primera página con defaults (page 1, limit 10) y envelope meta', async () => {
    prismaMock.workshop.count.mockResolvedValue(25);

    const result = await handler.execute({});

    expect(prismaMock.workshop.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { isActive: true },
        skip: 0,
        take: 10,
        orderBy: { name: 'asc' },
      }),
    );
    expect(result.meta).toEqual({
      total: 25,
      page: 1,
      limit: 10,
      totalPages: 3,
    });
    expect(result.data).toEqual([]);
  });

  it('pagina con skip/take según page y limit', async () => {
    await handler.execute({ page: 3, limit: 10 });

    expect(prismaMock.workshop.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 20, take: 10 }),
    );
  });

  it('clampa limit a CATALOG_MAX_LIMIT (50) y page a >= 1', async () => {
    await handler.execute({ page: 0, limit: 500 });

    expect(prismaMock.workshop.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0, take: 50 }),
    );
  });

  it('sanea page/limit no finitos (NaN de query params) a los defaults', async () => {
    await handler.execute({ page: Number('abc'), limit: Number('xyz') });

    expect(prismaMock.workshop.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0, take: 10 }),
    );
  });

  it('filtra por q con contains + insensitive + escapeLike, solo activos', async () => {
    await handler.execute({ q: '100%' });

    expect(prismaMock.workshop.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          isActive: true,
          name: { contains: '100\\%', mode: 'insensitive' },
        },
      }),
    );
  });

  it('rechaza 400 cuando q trimmed tiene menos de 2 caracteres', async () => {
    await expect(handler.execute({ q: 'a' })).rejects.toThrow(
      BadRequestException,
    );
    expect(prismaMock.workshop.findMany).not.toHaveBeenCalled();
  });

  it('rechaza 400 cuando q supera los 50 caracteres', async () => {
    await expect(handler.execute({ q: 'x'.repeat(51) })).rejects.toThrow(
      BadRequestException,
    );
    expect(prismaMock.workshop.findMany).not.toHaveBeenCalled();
  });

  it('q vacío (solo espacios) lista el catálogo completo', async () => {
    await handler.execute({ q: '   ' });

    expect(prismaMock.workshop.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isActive: true } }),
    );
  });

  it('aplica count con el mismo where del findMany', async () => {
    await handler.execute({ q: 'Taller' });

    expect(prismaMock.workshop.count).toHaveBeenCalledWith({
      where: {
        isActive: true,
        name: { contains: 'Taller', mode: 'insensitive' },
      },
    });
  });

  it('mapea la ciudad de la sede (isHeadquarters) y tolera talleres sin sede', async () => {
    prismaMock.workshop.findMany.mockResolvedValue([
      {
        id: 'w-1',
        name: 'Taller Don Pepe',
        logoUrl: 'https://cdn.example/logo.png',
        branches: [{ city: 'Montevideo' }],
      },
      { id: 'w-2', name: 'Taller El Mecánico', logoUrl: null, branches: [] },
    ]);
    prismaMock.workshop.count.mockResolvedValue(2);

    const result = await handler.execute({});

    expect(result.data).toEqual([
      {
        id: 'w-1',
        name: 'Taller Don Pepe',
        logoUrl: 'https://cdn.example/logo.png',
        city: 'Montevideo',
      },
      { id: 'w-2', name: 'Taller El Mecánico', logoUrl: null, city: null },
    ]);
  });
});
