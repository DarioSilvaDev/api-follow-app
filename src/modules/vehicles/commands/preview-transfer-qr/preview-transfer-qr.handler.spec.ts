import {
  ConflictException,
  GoneException,
  NotFoundException,
} from '@nestjs/common';
import { PreviewTransferQrHandler } from './preview-transfer-qr.handler';
import { PreviewTransferQrCommand } from './preview-transfer-qr.command';

describe('PreviewTransferQrHandler', () => {
  let handler: PreviewTransferQrHandler;
  let prismaMock: any;
  let eventEmitterMock: { emit: jest.Mock };

  const cmd = new PreviewTransferQrCommand('token-1');

  const pendingQr = {
    id: 'qr-1',
    vehicleId: 'vehicle-1',
    createdByUserId: 'user-1',
    status: 'pending',
    source: 'presencial',
    expiresAt: new Date(Date.now() + 3600_000),
    vehicle: {
      id: 'vehicle-1',
      licensePlate: 'ABC123',
      version: {
        model: { brand: { name: 'Toyota' }, name: 'Corolla' },
        name: '1.8',
      },
    },
    createdBy: {
      id: 'user-1',
      firstName: 'Juan',
      lastName: 'Perez',
      alias: 'jperez',
    },
  };

  beforeEach(() => {
    prismaMock = {
      vehicleTransferQr: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };
    eventEmitterMock = { emit: jest.fn() };
    handler = new PreviewTransferQrHandler(prismaMock, eventEmitterMock as any);
  });

  it('D-080/D-082: exposes vehicle + emisor (with alias) for a pending QR', async () => {
    prismaMock.vehicleTransferQr.findUnique.mockResolvedValue(pendingQr);

    const result = await handler.execute(cmd);

    expect(result.vehicle.licensePlate).toBe('ABC123');
    expect(result.fromUser.alias).toBe('jperez');
    expect(result.secondsRemaining).toBeGreaterThan(0);
  });

  it('D-088: lazily marks a pending QR as expired when expiresAt passed', async () => {
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
    expect(thrown.message).toContain('QR');
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
    expect(thrown.message).toContain('QR');
  });

  it('Gone (410): revoked QR is not previewable', async () => {
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

  it('Conflict (409): consumed QR is one-shot', async () => {
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
});