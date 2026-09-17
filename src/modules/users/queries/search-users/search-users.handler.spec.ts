import { SearchUsersHandler } from './search-users.handler';

describe('SearchUsersHandler — Fase 2 (RF-6) alias matching', () => {
  let handler: SearchUsersHandler;
  let prismaMock: any;

  beforeEach(() => {
    prismaMock = {
      user: { findMany: jest.fn(), count: jest.fn() },
    };
    handler = new SearchUsersHandler(prismaMock);
  });

  it('adds alias to the OR when searching', async () => {
    prismaMock.user.findMany.mockResolvedValue([]);
    prismaMock.user.count.mockResolvedValue(0);

    await handler.execute({ q: 'juan' });

    const arg = prismaMock.user.findMany.mock.calls[0][0];
    expect(arg.where.OR).toContainEqual({
      alias: { contains: 'juan', mode: 'insensitive' },
    });
    expect(arg.where.OR).toContainEqual({
      email: { contains: 'juan', mode: 'insensitive' },
    });
    expect(arg.where.OR).toContainEqual({
      firstName: { contains: 'juan', mode: 'insensitive' },
    });
    expect(arg.where.OR).toContainEqual({
      lastName: { contains: 'juan', mode: 'insensitive' },
    });
  });
});
