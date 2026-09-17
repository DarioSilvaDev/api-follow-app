import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, QrSource } from '@prisma/client';
import { GenerateTransferQrHandler } from './generate-transfer-qr.handler';
import { GenerateTransferQrCommand } from './generate-transfer-qr.command';

describe('GenerateTransferQrHandler', () => {
  let handler: GenerateTransferQrHandler;
  let prismaMock: any;
  let eventEmitterMock: { emit: jest.Mock };

  const cmd = new GenerateTransferQrCommand('vehicle-1', 'user-1', {
    source: QrSource.presencial,
  });

  const p2002 = () =>
    new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: '6.19.3',
      meta: { target: ['vehicle_transfer_qrs_one_active_per_vehicle'] },
    });

  beforeEach(() => {
    prismaMock = {
      vehicle: { findUnique: jest.fn() },
      vehicleTransferQr: {
        findFirst: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
      },
      vehicleTransfer: { findFirst: jest.fn() },
    };
    eventEmitterMock = { emit: jest.fn() };
    handler = new GenerateTransferQrHandler(
      prismaMock,
      eventEmitterMock as any,
    );
  });

  it('D-079: generates a pending QR with 1h TTL for source=presencial', async () => {
    prismaMock.vehicle.findUnique.mockResolvedValue({
      id: 'vehicle-1',
      ownerships: [{ userId: 'user-1' }],
    });
    prismaMock.vehicleTransferQr.findFirst.mockResolvedValue(null);
    prismaMock.vehicleTransfer.findFirst.mockResolvedValue(null);
    prismaMock.vehicleTransferQr.create.mockResolvedValue({
      id: 'qr-1',
      token: 'a'.repeat(32),
      source: 'presencial',
      expiresAt: new Date(Date.now() + 3600_000),
      vehicleId: 'vehicle-1',
      createdByUserId: 'user-1',
      status: 'pending',
    });

    const result = await handler.execute(cmd);

    expect(result.secondsRemaining).toBe(3600);
    expect(result.token).toHaveLength(32);
    expect(result.url).toContain(`/transfer/qr/${result.token}`);
    expect(prismaMock.vehicleTransferQr.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'pending',
          source: 'presencial',
        }),
      }),
    );
  });

  it('D-086: source=concesionaria applies the 48h TTL', async () => {
    prismaMock.vehicle.findUnique.mockResolvedValue({
      id: 'vehicle-1',
      ownerships: [{ userId: 'user-1' }],
    });
    prismaMock.vehicleTransferQr.findFirst.mockResolvedValue(null);
    prismaMock.vehicleTransfer.findFirst.mockResolvedValue(null);
    prismaMock.vehicleTransferQr.create.mockResolvedValue({
      id: 'qr-1',
      token: 'b'.repeat(32),
      source: 'concesionaria',
      expiresAt: new Date(Date.now() + 172_800_000),
      vehicleId: 'vehicle-1',
      createdByUserId: 'user-1',
      status: 'pending',
    });

    const result = await handler.execute(
      new GenerateTransferQrCommand('vehicle-1', 'user-1', {
        source: QrSource.concesionaria,
      }),
    );

    expect(result.secondsRemaining).toBe(172800);
  });

  it('P2002 on the partial unique index (concurrent generate) → 409, not 500', async () => {
    prismaMock.vehicle.findUnique.mockResolvedValue({
      id: 'vehicle-1',
      ownerships: [{ userId: 'user-1' }],
    });
    prismaMock.vehicleTransferQr.findFirst.mockResolvedValue(null);
    prismaMock.vehicleTransfer.findFirst.mockResolvedValue(null);
    // Carrera concurrente: otro request crea el QR pending entre el pre-check
    // y el create → el índice parcial único revienta con P2002.
    prismaMock.vehicleTransferQr.create.mockRejectedValue(p2002());

    let thrown: any;
    try {
      await handler.execute(cmd);
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(ConflictException);
    expect(thrown.message).toBe(
      'Ya existe un QR de transferencia pendiente para este vehículo',
    );
  });

  it('rethrows non-P2002 create errors as-is', async () => {
    prismaMock.vehicle.findUnique.mockResolvedValue({
      id: 'vehicle-1',
      ownerships: [{ userId: 'user-1' }],
    });
    prismaMock.vehicleTransferQr.findFirst.mockResolvedValue(null);
    prismaMock.vehicleTransfer.findFirst.mockResolvedValue(null);
    const boom = new Error('boom');
    prismaMock.vehicleTransferQr.create.mockRejectedValue(boom);

    await expect(handler.execute(cmd)).rejects.toBe(boom);
  });

  it('D-079: rejects when an active pending QR already exists', async () => {
    prismaMock.vehicle.findUnique.mockResolvedValue({
      id: 'vehicle-1',
      ownerships: [{ userId: 'user-1' }],
    });
    prismaMock.vehicleTransferQr.findFirst.mockResolvedValue({
      id: 'qr-existing',
      status: 'pending',
    });
    prismaMock.vehicleTransfer.findFirst.mockResolvedValue(null);

    let thrown: any;
    try {
      await handler.execute(cmd);
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(ConflictException);
    expect(prismaMock.vehicleTransferQr.create).not.toHaveBeenCalled();
  });

  it('AC7.5: rejects with 409 when an alive pending email transfer exists', async () => {
    prismaMock.vehicle.findUnique.mockResolvedValue({
      id: 'vehicle-1',
      ownerships: [{ userId: 'user-1' }],
    });
    prismaMock.vehicleTransferQr.findFirst.mockResolvedValue(null);
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
    expect(thrown.message).toContain('pendiente');
    expect(prismaMock.vehicleTransferQr.create).not.toHaveBeenCalled();
  });

  it('D-079: lazily expires a stale pending QR before generating', async () => {
    prismaMock.vehicle.findUnique.mockResolvedValue({
      id: 'vehicle-1',
      ownerships: [{ userId: 'user-1' }],
    });
    // First call (stale pending check) returns an expired pending; second call
    // (active pending check) returns null after lazy-expire.
    prismaMock.vehicleTransferQr.findFirst
      .mockResolvedValueOnce({
        id: 'qr-stale',
        status: 'pending',
        expiresAt: new Date(Date.now() - 1000),
        vehicleId: 'vehicle-1',
        createdByUserId: 'user-1',
      })
      .mockResolvedValueOnce(null);
    prismaMock.vehicleTransfer.findFirst.mockResolvedValue(null);
    prismaMock.vehicleTransferQr.create.mockResolvedValue({
      id: 'qr-1',
      token: 'c'.repeat(32),
      source: 'presencial',
      expiresAt: new Date(Date.now() + 3600_000),
      vehicleId: 'vehicle-1',
      createdByUserId: 'user-1',
      status: 'pending',
    });

    const result = await handler.execute(cmd);

    expect(prismaMock.vehicleTransferQr.update).toHaveBeenCalledWith({
      where: { id: 'qr-stale' },
      data: { status: 'expired' },
    });
    expect(eventEmitterMock.emit).toHaveBeenCalledWith(
      'vehicle.transfer.qr_expired',
      expect.any(Object),
    );
    expect(result.token).toBe('c'.repeat(32));
  });

  it('403: non-owner cannot generate a QR', async () => {
    prismaMock.vehicle.findUnique.mockResolvedValue({
      id: 'vehicle-1',
      ownerships: [{ userId: 'other-owner' }],
    });

    let thrown: any;
    try {
      await handler.execute(cmd);
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(ForbiddenException);
  });

  it('404: unknown vehicle', async () => {
    prismaMock.vehicle.findUnique.mockResolvedValue(null);

    let thrown: any;
    try {
      await handler.execute(cmd);
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(NotFoundException);
  });
});
