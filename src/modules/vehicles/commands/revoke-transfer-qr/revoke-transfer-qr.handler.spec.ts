import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { RevokeTransferQrHandler } from './revoke-transfer-qr.handler';
import { RevokeTransferQrCommand } from './revoke-transfer-qr.command';

describe('RevokeTransferQrHandler', () => {
  let handler: RevokeTransferQrHandler;
  let prismaMock: any;

  const cmd = new RevokeTransferQrCommand('vehicle-1', 'user-1');

  const dealershipCtx = {
    type: 'DEALERSHIP',
    dealershipId: 'dealership-1',
    userId: 'user-member',
    memberId: 'member-1',
    roleId: 'role-1',
  } as any;

  beforeEach(() => {
    prismaMock = {
      vehicle: { findUnique: jest.fn() },
      vehicleTransferQr: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      dealershipMember: { findUnique: jest.fn() },
    };
    handler = new RevokeTransferQrHandler(prismaMock);
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

  describe('Fase 2b — rama DEALERSHIP (B2)', () => {
    const dealershipCmd = new RevokeTransferQrCommand(
      'vehicle-1',
      'user-member',
      dealershipCtx,
    );

    it('miembro activo con permiso sell revoca el QR pending', async () => {
      prismaMock.dealershipMember.findUnique.mockResolvedValue({
        status: 'active',
        dealership: { isActive: true },
        role: {
          permissions: [{ permission: { code: 'dealership.vehicle.sell' } }],
        },
      });
      prismaMock.vehicle.findUnique.mockResolvedValue({
        id: 'vehicle-1',
        ownerships: [{ dealershipId: 'dealership-1', type: 'company' }],
      });
      prismaMock.vehicleTransferQr.findFirst.mockResolvedValue({
        id: 'qr-1',
        status: 'pending',
      });
      prismaMock.vehicleTransferQr.update.mockResolvedValue({
        id: 'qr-1',
        status: 'revoked',
      });

      const result = await handler.execute(dealershipCmd);

      expect(prismaMock.vehicleTransferQr.update).toHaveBeenCalledWith({
        where: { id: 'qr-1' },
        data: { status: 'revoked', revokedAt: expect.any(Date) },
      });
      expect(result.revoked).toBe(true);
    });

    it('403: miembro sin permiso sell/return no puede revocar', async () => {
      prismaMock.dealershipMember.findUnique.mockResolvedValue({
        status: 'active',
        dealership: { isActive: true },
        role: { permissions: [] },
      });

      let thrown: any;
      try {
        await handler.execute(dealershipCmd);
      } catch (err) {
        thrown = err;
      }

      expect(thrown).toBeInstanceOf(ForbiddenException);
      expect(prismaMock.vehicleTransferQr.findFirst).not.toHaveBeenCalled();
    });

    it('403: la dealership no es la titular actual (type company)', async () => {
      prismaMock.dealershipMember.findUnique.mockResolvedValue({
        status: 'active',
        dealership: { isActive: true },
        role: {
          permissions: [{ permission: { code: 'dealership.vehicle.return' } }],
        },
      });
      prismaMock.vehicle.findUnique.mockResolvedValue({
        id: 'vehicle-1',
        ownerships: [{ dealershipId: 'other-dealership', type: 'company' }],
      });

      let thrown: any;
      try {
        await handler.execute(dealershipCmd);
      } catch (err) {
        thrown = err;
      }

      expect(thrown).toBeInstanceOf(ForbiddenException);
      expect(prismaMock.vehicleTransferQr.findFirst).not.toHaveBeenCalled();
    });

    it('D-079: revoke idempotente en rama dealership (sin pending)', async () => {
      prismaMock.dealershipMember.findUnique.mockResolvedValue({
        status: 'active',
        dealership: { isActive: true },
        role: {
          permissions: [{ permission: { code: 'dealership.vehicle.sell' } }],
        },
      });
      prismaMock.vehicle.findUnique.mockResolvedValue({
        id: 'vehicle-1',
        ownerships: [{ dealershipId: 'dealership-1', type: 'company' }],
      });
      prismaMock.vehicleTransferQr.findFirst.mockResolvedValue(null);

      const result = await handler.execute(dealershipCmd);

      expect(result.revoked).toBe(false);
      expect(prismaMock.vehicleTransferQr.update).not.toHaveBeenCalled();
    });

    it('P2: concesionaria inactiva → 403 sin revocar', async () => {
      prismaMock.dealershipMember.findUnique.mockResolvedValue({
        status: 'active',
        dealership: { isActive: false },
        role: {
          permissions: [{ permission: { code: 'dealership.vehicle.sell' } }],
        },
      });

      let thrown: any;
      try {
        await handler.execute(dealershipCmd);
      } catch (err) {
        thrown = err;
      }

      expect(thrown).toBeInstanceOf(ForbiddenException);
      expect(prismaMock.vehicleTransferQr.findFirst).not.toHaveBeenCalled();
    });
  });
});
