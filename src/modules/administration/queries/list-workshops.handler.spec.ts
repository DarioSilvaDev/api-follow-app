import { ListWorkshopsHandler } from './list-workshops.handler';

/**
 * P5: orden "pendientes primero" — status asc (orden de declaración del
 * enum en PG: pending_claim antes que active) + createdAt desc.
 */
describe('ListWorkshopsHandler — P5 orden pendientes primero', () => {
  let handler: ListWorkshopsHandler;
  let prismaMock: any;

  beforeEach(() => {
    prismaMock = {
      workshop: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    };
    handler = new ListWorkshopsHandler(prismaMock);
  });

  it('ordena por status asc (pendientes primero) y createdAt desc', async () => {
    await handler.execute({});

    expect(prismaMock.workshop.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      }),
    );
  });
});
