import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  NotFoundException,
} from '@nestjs/common';
import { AcceptTransferQrHandler } from './accept-transfer-qr.handler';
import { AcceptTransferQrCommand } from './accept-transfer-qr.command';

describe('AcceptTransferQrHandler', () => {
  let handler: AcceptTransferQrHandler;
  let prismaMock: any;
  let eventEmitterMock: { emit: jest.Mock };

  const pendingQr = {
    id: 'qr-1',
    vehicleId: 'vehicle-1',
    createdByUserId: 'user-owner',
    status: 'pending',
    source: 'presencial',
    expiresAt: new Date(Date.now() + 3600_000),
  };

  const cmd = new AcceptTransferQrCommand('token-1', 'user-buyer', {
    confirmation: true,
  });

  beforeEach(() => {
    prismaMock = {
      vehicleTransferQr: {
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      vehicleTransfer: { findFirst: jest.fn(), create: jest.fn() },
      vehicleTransferEvent: { create: jest.fn() },
      vehicleOwnership: {
        findFirst: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
      },
      $transaction: jest.fn((cb) => cb(prismaMock)),
    };
    eventEmitterMock = { emit: jest.fn() };
    handler = new AcceptTransferQrHandler(prismaMock, eventEmitterMock as any);
  });

  it('D-081: completes the transfer in one transaction (ownership closed+created, events, QR consumed)', async () => {
    prismaMock.vehicleTransferQr.findUnique.mockResolvedValue(pendingQr);
    prismaMock.vehicleTransferQr.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.vehicleTransfer.findFirst.mockResolvedValue(null);
    prismaMock.vehicleOwnership.findFirst.mockResolvedValue({
      id: 'ownership-current',
      vehicleId: 'vehicle-1',
    });
    prismaMock.vehicleTransfer.create.mockResolvedValue({
      id: 'transfer-1',
      status: 'completed',
    });

    const result = await handler.execute(cmd);

    // H1: el gate de consumo vive DENTRO de la transacción, idempotente
    // (solo matchea status='pending').
    expect(prismaMock.vehicleTransferQr.updateMany).toHaveBeenCalledWith({
      where: { id: 'qr-1', status: 'pending' },
      data: expect.objectContaining({
        status: 'consumed',
        consumedByUserId: 'user-buyer',
      }),
    });
    // Transfer created completed
    expect(prismaMock.vehicleTransfer.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'completed',
          fromUserId: 'user-owner',
          toUserId: 'user-buyer',
        }),
      }),
    );
    // Event types registered (requested, ownership_closed, ownership_created, completed)
    const createdEvents = prismaMock.vehicleTransferEvent.create.mock.calls.map(
      (c: any) => c[0].data.type,
    );
    expect(createdEvents).toContain('requested');
    expect(createdEvents).toContain('ownership_closed');
    expect(createdEvents).toContain('ownership_created');
    expect(createdEvents).toContain('completed');
    // Emitted vehicle.transfer.accepted (reuses existing email listener)
    expect(eventEmitterMock.emit).toHaveBeenCalledWith(
      'vehicle.transfer.accepted',
      expect.any(Object),
    );
    expect(result.status).toBe('completed');
  });

  it('H1 race: two concurrent accepts with the same token → exactly 1 success + 1 Conflict, single transfer row', async () => {
    prismaMock.vehicleTransferQr.findUnique.mockResolvedValue(pendingQr);
    prismaMock.vehicleTransfer.findFirst.mockResolvedValue(null);
    prismaMock.vehicleOwnership.findFirst.mockResolvedValue({
      id: 'ownership-current',
      vehicleId: 'vehicle-1',
    });
    prismaMock.vehicleTransfer.create.mockResolvedValue({
      id: 'transfer-1',
      status: 'completed',
    });

    // Simula la serialización en PostgreSQL: el primer execute matchea el gate
    // (count=1); el segundo ya ve el QR consumido (count=0) → 409 + rollback.
    prismaMock.vehicleTransferQr.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });

    const first = await handler.execute(cmd);

    let thrown: any;
    try {
      await handler.execute(cmd);
    } catch (err) {
      thrown = err;
    }

    expect(first.status).toBe('completed');
    expect(thrown).toBeInstanceOf(ConflictException);
    expect(thrown.message).toBe('Este QR ya fue utilizado');
    // Una sola transferencia creada / una sola ownership creada (el perdedor hace rollback).
    expect(prismaMock.vehicleTransfer.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.vehicleOwnership.create).toHaveBeenCalledTimes(1);
  });

  it('400: emisor cannot accept their own QR', async () => {
    prismaMock.vehicleTransferQr.findUnique.mockResolvedValue(pendingQr);

    let thrown: any;
    try {
      await handler.execute(
        new AcceptTransferQrCommand('token-1', 'user-owner', {
          confirmation: true,
        }),
      );
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(BadRequestException);
    expect(prismaMock.vehicleTransferQr.update).not.toHaveBeenCalled();
  });

  it('400: confirmation must be true', async () => {
    prismaMock.vehicleTransferQr.findUnique.mockResolvedValue(pendingQr);

    let thrown: any;
    try {
      await handler.execute(
        new AcceptTransferQrCommand('token-1', 'user-buyer', {
          confirmation: false,
        }),
      );
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(BadRequestException);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('AC7.5: 409 when an alive pending email transfer exists for the vehicle', async () => {
    prismaMock.vehicleTransferQr.findUnique.mockResolvedValue(pendingQr);
    prismaMock.vehicleTransfer.findFirst.mockResolvedValue({
      id: 'pending-alive',
      status: 'pending',
      expiresAt: new Date(Date.now() + 60_000),
    });

    let thrown: any;
    try {
      await handler.execute(cmd);
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(ConflictException);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('D-088: lazily expires a pending QR past expiresAt before accept', async () => {
    prismaMock.vehicleTransferQr.findUnique.mockResolvedValue({
      ...pendingQr,
      expiresAt: new Date(Date.now() - 1000),
    });

    let thrown: any;
    try {
      await handler.execute(cmd);
    } catch (err) {
      thrown = err;
    }

    expect(prismaMock.vehicleTransferQr.update).toHaveBeenCalledWith({
      where: { id: 'qr-1' },
      data: { status: 'expired' },
    });
    expect(eventEmitterMock.emit).toHaveBeenCalledWith(
      'vehicle.transfer.qr_expired',
      expect.any(Object),
    );
    expect(thrown).toBeInstanceOf(NotFoundException);
  });

  it('Gone (410): revoked QR cannot be accepted', async () => {
    prismaMock.vehicleTransferQr.findUnique.mockResolvedValue({
      ...pendingQr,
      status: 'revoked',
    });

    let thrown: any;
    try {
      await handler.execute(cmd);
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(GoneException);
  });

  it('Conflict (409): consumed QR cannot be accepted again', async () => {
    prismaMock.vehicleTransferQr.findUnique.mockResolvedValue({
      ...pendingQr,
      status: 'consumed',
    });

    let thrown: any;
    try {
      await handler.execute(cmd);
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(ConflictException);
  });

  it('404: unknown token', async () => {
    prismaMock.vehicleTransferQr.findUnique.mockResolvedValue(null);

    let thrown: any;
    try {
      await handler.execute(cmd);
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(NotFoundException);
  });
});
