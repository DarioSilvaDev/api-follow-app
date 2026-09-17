import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { RevokeTransferQrHandler } from './revoke-transfer-qr.handler';
import { RevokeTransferQrCommand } from './revoke-transfer-qr.command';

describe('RevokeTransferQrHandler', () => {
  let handler: RevokeTransferQrHandler;
  let prismaMock: any;

  const cmd = new RevokeTransferQrCommand('vehicle-1', 'user-1');

  beforeEach(() => {
    prismaMock = {
      vehicle: { findUnique: jest.fn() },
      vehicleTransferQr: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
    };
    handler = new RevokeTransferQrHandler(prismaMock as any);
  });

  it('D-079: owner revokes the pending QR (status → revoked)', async () => {
    prismaMock.vehicle.findUnique.mockResolvedValue({
      id: 'vehicle-1',
      ownerships: [{ userId: 'user-1' }],
    });
    prismaMock.vehicleTransferQr.findFirst.mockResolvedValue({
      id: 'qr-1',
      status: 'pending',
    });
    prismaMock.vehicleTransferQr.update.mockResolvedValue({
      id: 'qr-1',
      status: 'revoked',
    });

    const result = await handler.execute(cmd);

    expect(prismaMock.vehicleTransferQr.update).toHaveBeenCalledWith({
      where: { id: 'qr-1' },
      data: { status: 'revoked', revokedAt: expect.any(Date) },
    });
    expect(result.revoked).toBe(true);
  });

  it('D-079: revoke is idempotent when no pending QR exists', async () => {
    prismaMock.vehicle.findUnique.mockResolvedValue({
      id: 'vehicle-1',
      ownerships: [{ userId: 'user-1' }],
    });
    prismaMock.vehicleTransferQr.findFirst.mockResolvedValue(null);

    const result = await handler.execute(cmd);

    expect(result.revoked).toBe(false);
    expect(prismaMock.vehicleTransferQr.update).not.toHaveBeenCalled();
  });

  it('403: non-owner cannot revoke', async () => {
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
    expect(prismaMock.vehicleTransferQr.findFirst).not.toHaveBeenCalled();
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