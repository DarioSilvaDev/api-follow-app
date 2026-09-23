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
