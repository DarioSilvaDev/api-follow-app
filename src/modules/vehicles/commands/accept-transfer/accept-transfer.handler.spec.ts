import { BadRequestException } from '@nestjs/common';
import { AcceptTransferHandler } from './accept-transfer.handler';
import { AcceptTransferCommand } from './accept-transfer.command';

describe('AcceptTransferHandler — P2 race gate (idempotent pending re-check inside tx)', () => {
  let handler: AcceptTransferHandler;
  let prismaMock: any;
  let eventEmitterMock: { emit: jest.Mock };

  const pendingTransfer = {
    id: 'transfer-1',
    vehicleId: 'vehicle-1',
    fromUserId: 'user-owner',
    toUserId: 'user-buyer',
    status: 'pending',
    requestedAt: new Date(Date.now() - 60_000),
    respondedAt: null,
    completedAt: null,
    expiresAt: new Date(Date.now() + 7 * 24 * 3600_000),
    notes: null,
  };

  const completedTransfer = {
    ...pendingTransfer,
    status: 'completed',
    respondedAt: new Date(),
    completedAt: new Date(),
  };

  const cmd = new AcceptTransferCommand('transfer-1', 'user-buyer');

  beforeEach(() => {
    prismaMock = {
      vehicleTransfer: {
        findUnique: jest.fn(),
        updateMany: jest.fn(),
      },
      vehicleTransferEvent: { create: jest.fn() },
      vehicleOwnership: {
        findFirst: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
      },
      $transaction: jest.fn((cb) => cb(prismaMock)),
    };
    eventEmitterMock = { emit: jest.fn() };
    handler = new AcceptTransferHandler(prismaMock, eventEmitterMock as any);
  });

  it('completes the transfer inside the transaction through the idempotent pending gate', async () => {
    prismaMock.vehicleTransfer.findUnique
      .mockResolvedValueOnce(pendingTransfer) // read inicial
      .mockResolvedValue(completedTransfer); // read post-gate (respuesta)
    prismaMock.vehicleTransfer.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.vehicleOwnership.findFirst.mockResolvedValue({
      id: 'ownership-current',
      vehicleId: 'vehicle-1',
    });

    const result = await handler.execute(cmd);

    // P2: el gate re-chequea status='pending' dentro de la transacción
    expect(prismaMock.vehicleTransfer.updateMany).toHaveBeenCalledWith({
      where: { id: 'transfer-1', status: 'pending' },
      data: expect.objectContaining({ status: 'completed' }),
    });
    // events ownership_closed / ownership_created / completed
    const createdEvents = prismaMock.vehicleTransferEvent.create.mock.calls.map(
      (c: any) => c[0].data.type,
    );
    expect(createdEvents).toContain('ownership_closed');
    expect(createdEvents).toContain('ownership_created');
    expect(createdEvents).toContain('completed');
    expect(eventEmitterMock.emit).toHaveBeenCalledWith(
      'vehicle.transfer.accepted',
      expect.any(Object),
    );
    expect(result.status).toBe('completed');
  });

  it('P2 race: two concurrent accepts for the same transfer → exactly 1 success + 1 BadRequest, one ownership row', async () => {
    prismaMock.vehicleTransfer.findUnique
      .mockResolvedValueOnce(pendingTransfer) // execute 1 read
      .mockResolvedValueOnce(completedTransfer) // execute 1 post-gate read
      .mockResolvedValue(pendingTransfer); // execute 2 read inicial
    // Primero matchea el gate (count=1); el segundo ya ve status='completed' (count=0).
    prismaMock.vehicleTransfer.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    prismaMock.vehicleOwnership.findFirst.mockResolvedValue({
      id: 'ownership-current',
      vehicleId: 'vehicle-1',
    });

    const first = await handler.execute(cmd);

    let thrown: any;
    try {
      await handler.execute(cmd);
    } catch (err) {
      thrown = err;
    }

    expect(first.status).toBe('completed');
    expect(thrown).toBeInstanceOf(BadRequestException);
    expect(thrown.message).toBe('Transfer is not pending');
    // El perdedor hace rollback: una sola ownership creada y 3 eventos en total
    // (ownership_closed, ownership_created, completed) del ganador.
    expect(prismaMock.vehicleOwnership.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.vehicleTransferEvent.create).toHaveBeenCalledTimes(3);
  });
});
