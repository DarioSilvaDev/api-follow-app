import { BadRequestException } from '@nestjs/common';
import { SearchWorkshopsHandler } from './search-workshops.handler';

describe('SearchWorkshopsHandler — RF-8 workshop search (owner)', () => {
  let handler: SearchWorkshopsHandler;
  let prismaMock: { workshop: { findMany: jest.Mock } };

  beforeEach(() => {
    prismaMock = {
      workshop: { findMany: jest.fn().mockResolvedValue([]) },
    };
    handler = new SearchWorkshopsHandler(prismaMock as any);
  });

  it('rejects 400 when q is shorter than 2 chars', async () => {
    await expect(handler.execute('')).rejects.toThrow(BadRequestException);
    await expect(handler.execute('a')).rejects.toThrow(BadRequestException);
    expect(prismaMock.workshop.findMany).not.toHaveBeenCalled();
  });

  it('rejects 400 when q exceeds 50 chars', async () => {
    await expect(handler.execute('x'.repeat(51))).rejects.toThrow(
      BadRequestException,
    );
    expect(prismaMock.workshop.findMany).not.toHaveBeenCalled();
  });

  it('searches active workshops with contains + insensitive + escaped input, ordered by name', async () => {
    await handler.execute('Taller');

    expect(prismaMock.workshop.findMany).toHaveBeenCalledWith({
      where: {
        isActive: true,
        name: { contains: 'Taller', mode: 'insensitive' },
      },
      select: expect.anything(),
      orderBy: { name: 'asc' },
      take: 10,
    });
  });

  it('treats LIKE wildcards in the input as literal text (no pattern injection)', async () => {
    await handler.execute('100%');

    expect(prismaMock.workshop.findMany).toHaveBeenCalledWith({
      where: {
        isActive: true,
        name: { contains: '100\\%', mode: 'insensitive' },
      },
      select: expect.anything(),
      orderBy: { name: 'asc' },
      take: 10,
    });
  });

  it('maps the HQ branch city into the response (no branch enumeration)', async () => {
    prismaMock.workshop.findMany.mockResolvedValue([
      {
        id: 'w-1',
        name: 'Taller Don Pepe',
        logoUrl: 'https://cdn.example/logo.png',
        branches: [{ city: 'Montevideo' }],
      },
      {
        id: 'w-2',
        name: 'Taller El Mecánico',
        logoUrl: null,
        branches: [],
      },
    ]);

    const result = await handler.execute('taller');

    expect(result).toEqual([
      {
        id: 'w-1',
        name: 'Taller Don Pepe',
        logoUrl: 'https://cdn.example/logo.png',
        city: 'Montevideo',
      },
      { id: 'w-2', name: 'Taller El Mecánico', logoUrl: null, city: null },
    ]);
  });

  it('returns [] when nothing matches', async () => {
    const result = await handler.execute('zzzz');
    expect(result).toEqual([]);
  });
});
