import { ListDealershipsHandler } from './list-dealerships.handler';

/**
 * P5: orden "pendientes primero" — status asc (orden de declaración del
 * enum en PG: pending_claim antes que active) + createdAt desc.
 */
describe('ListDealershipsHandler — P5 orden pendientes primero', () => {
  let handler: ListDealershipsHandler;
  let prismaMock: any;

  beforeEach(() => {
    prismaMock = {
      dealership: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    };
    handler = new ListDealershipsHandler(prismaMock);
  });

  it('ordena por status asc (pendientes primero) y createdAt desc', async () => {
    await handler.execute({});

    expect(prismaMock.dealership.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      }),
    );
  });
});
