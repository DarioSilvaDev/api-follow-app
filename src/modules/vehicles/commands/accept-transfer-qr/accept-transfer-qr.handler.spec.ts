import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  NotFoundException,
} from '@nestjs/common';
import { AcceptTransferQrHandler } from './accept-transfer-qr.handler';
import { AcceptTransferQrCommand } from './accept-transfer-qr.command';
import { AcceptConsignmentTakeQrCommand } from '../accept-consignment-take/accept-consignment-take.command';

describe('AcceptTransferQrHandler', () => {
  let handler: AcceptTransferQrHandler;
  let prismaMock: any;
  let eventEmitterMock: { emit: jest.Mock };
  let acceptConsignmentTakeQrMock: { execute: jest.Mock };

  const dealershipCtx = {
    type: 'DEALERSHIP',
    dealershipId: 'dealership-1',
    userId: 'user-member',
    memberId: 'member-1',
    roleId: 'role-1',
  } as any;

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
      dealershipMember: { findUnique: jest.fn() },
      vehicleAccess: { updateMany: jest.fn() },
      $transaction: jest.fn((cb) => cb(prismaMock)),
    };
    eventEmitterMock = { emit: jest.fn() };
    acceptConsignmentTakeQrMock = { execute: jest.fn() };
    handler = new AcceptTransferQrHandler(
      prismaMock,
      eventEmitterMock as any,
      acceptConsignmentTakeQrMock as any,
    );
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

  describe('Fase 2b — tramos de consignación', () => {
    it('A1: un QR de TOMA en contexto persona → 409 sin delegar', async () => {
      prismaMock.vehicleTransferQr.findUnique.mockResolvedValue({
        ...pendingQr,
        purpose: 'take',
      });

      let thrown: any;
      try {
        await handler.execute(cmd);
      } catch (err) {
        thrown = err;
      }

      expect(thrown).toBeInstanceOf(ConflictException);
      expect(acceptConsignmentTakeQrMock.execute).not.toHaveBeenCalled();
    });

    it('A1: QR de TOMA en contexto DEALERSHIP → delega al take handler', async () => {
      prismaMock.vehicleTransferQr.findUnique.mockResolvedValue({
        ...pendingQr,
        purpose: 'take',
      });
      acceptConsignmentTakeQrMock.execute.mockResolvedValue({
        transferId: 'transfer-take',
        status: 'completed',
      });

      const takeCmd = new AcceptTransferQrCommand(
        'token-1',
        'user-member',
        { confirmation: true },
        dealershipCtx,
      );

      const result = await handler.execute(takeCmd);

      expect(acceptConsignmentTakeQrMock.execute).toHaveBeenCalledTimes(1);
      const delegated = acceptConsignmentTakeQrMock.execute.mock.calls[0][0];
      expect(delegated).toBeInstanceOf(AcceptConsignmentTakeQrCommand);
      expect(delegated).toMatchObject({
        userId: 'user-member',
        ctx: dealershipCtx,
      });
      expect(result).toEqual({
        transferId: 'transfer-take',
        status: 'completed',
      });
    });

    it('A1: QR de TOMA en contexto DEALERSHIP sin confirmation → 400', async () => {
      prismaMock.vehicleTransferQr.findUnique.mockResolvedValue({
        ...pendingQr,
        purpose: 'take',
      });

      let thrown: any;
      try {
        await handler.execute(
          new AcceptTransferQrCommand(
            'token-1',
            'user-member',
            { confirmation: false },
            dealershipCtx,
          ),
        );
      } catch (err) {
        thrown = err;
      }

      expect(thrown).toBeInstanceOf(BadRequestException);
      expect(acceptConsignmentTakeQrMock.execute).not.toHaveBeenCalled();
    });

    it('D-TL-16: venta — miembro activo de la dealership no puede aceptar', async () => {
      prismaMock.vehicleTransferQr.findUnique.mockResolvedValue({
        ...pendingQr,
        purpose: 'sale',
        createdByDealershipId: 'dealership-1',
      });
      prismaMock.dealershipMember.findUnique.mockResolvedValue({
        status: 'active',
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

    it('D-TL-16: venta — comprador persona acepta; tramo dealership + evento dedicado + revoca acceso vendedor', async () => {
      prismaMock.vehicleTransferQr.findUnique.mockResolvedValue({
        ...pendingQr,
        purpose: 'sale',
        createdByDealershipId: 'dealership-1',
      });
      prismaMock.dealershipMember.findUnique.mockResolvedValue(null);
      prismaMock.vehicleOwnership.findFirst.mockResolvedValue({
        id: 'own-1',
        vehicleId: 'vehicle-1',
        dealershipId: 'dealership-1',
      });
      // 1) chequeo pending email; 2) take transfer (M3, dentro del tx).
      prismaMock.vehicleTransfer.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ fromUserId: 'seller-1' });
      prismaMock.vehicleTransferQr.updateMany.mockResolvedValue({ count: 1 });
      prismaMock.vehicleAccess.updateMany.mockResolvedValue({ count: 1 });
      prismaMock.vehicleTransfer.create.mockResolvedValue({
        id: 'transfer-sale',
        status: 'completed',
      });

      const result = await handler.execute(cmd);

      // El tramo modelo origen = dealership (sin fromUser persona).
      expect(prismaMock.vehicleTransfer.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            fromUserId: null,
            fromDealershipId: 'dealership-1',
            toUserId: 'user-buyer',
            status: 'completed',
          }),
        }),
      );
      // M3: revoca el VehicleAccess del seller detectado en el take transfer.
      expect(prismaMock.vehicleAccess.updateMany).toHaveBeenCalledWith({
        where: {
          vehicleId: 'vehicle-1',
          userId: 'seller-1',
          revokedAt: null,
        },
        data: { revokedAt: expect.any(Date) },
      });
      // M4: evento dedicado, NO el clásico persona→persona.
      expect(eventEmitterMock.emit).toHaveBeenCalledWith(
        'vehicle.consignment.sold',
        expect.any(Object),
      );
      expect(eventEmitterMock.emit).not.toHaveBeenCalledWith(
        'vehicle.transfer.accepted',
        expect.any(Object),
      );
      expect(result).toEqual({
        transferId: 'transfer-sale',
        status: 'completed',
      });
    });

    it('venta: 409 si la dealership ya no es la titular actual', async () => {
      prismaMock.vehicleTransferQr.findUnique.mockResolvedValue({
        ...pendingQr,
        purpose: 'sale',
        createdByDealershipId: 'dealership-1',
      });
      prismaMock.dealershipMember.findUnique.mockResolvedValue(null);
      prismaMock.vehicleOwnership.findFirst.mockResolvedValue({
        id: 'own-1',
        userId: 'other-user',
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

    it('D-TL-16: devolución — solo el vendedor original acepta (403)', async () => {
      prismaMock.vehicleTransferQr.findUnique.mockResolvedValue({
        ...pendingQr,
        purpose: 'return',
        createdByDealershipId: 'dealership-1',
      });
      // resolveOriginalSeller: el vendedor original es otro usuario.
      prismaMock.vehicleTransfer.findFirst.mockResolvedValue({
        fromUserId: 'seller-original',
      });

      let thrown: any;
      try {
        await handler.execute(cmd);
      } catch (err) {
        thrown = err;
      }

      expect(thrown).toBeInstanceOf(ForbiddenException);
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it('D-TL-16: devolución — vendedor original recupera; evento dedicado + revoca su acceso', async () => {
      prismaMock.vehicleTransferQr.findUnique.mockResolvedValue({
        ...pendingQr,
        purpose: 'return',
        createdByDealershipId: 'dealership-1',
      });
      // 1) resolveOriginalSeller; 2) chequeo pending email.
      prismaMock.vehicleTransfer.findFirst
        .mockResolvedValueOnce({ fromUserId: 'seller-original' })
        .mockResolvedValueOnce(null);
      prismaMock.vehicleOwnership.findFirst.mockResolvedValue({
        id: 'own-1',
        vehicleId: 'vehicle-1',
        dealershipId: 'dealership-1',
      });
      prismaMock.vehicleTransferQr.updateMany.mockResolvedValue({ count: 1 });
      prismaMock.vehicleAccess.updateMany.mockResolvedValue({ count: 1 });
      prismaMock.vehicleTransfer.create.mockResolvedValue({
        id: 'transfer-return',
        status: 'completed',
      });

      const returnCmd = new AcceptTransferQrCommand(
        'token-1',
        'seller-original',
        { confirmation: true },
      );

      const result = await handler.execute(returnCmd);

      expect(prismaMock.vehicleTransfer.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            fromUserId: null,
            fromDealershipId: 'dealership-1',
            toUserId: 'seller-original',
          }),
        }),
      );
      // M3: revoca el VehicleAccess del vendedor (ya recuperó la titularidad).
      expect(prismaMock.vehicleAccess.updateMany).toHaveBeenCalledWith({
        where: {
          vehicleId: 'vehicle-1',
          userId: 'seller-original',
          revokedAt: null,
        },
        data: { revokedAt: expect.any(Date) },
      });
      expect(eventEmitterMock.emit).toHaveBeenCalledWith(
        'vehicle.consignment.returned',
        expect.any(Object),
      );
      expect(eventEmitterMock.emit).not.toHaveBeenCalledWith(
        'vehicle.transfer.accepted',
        expect.any(Object),
      );
      expect(result.status).toBe('completed');
    });
  });
});
