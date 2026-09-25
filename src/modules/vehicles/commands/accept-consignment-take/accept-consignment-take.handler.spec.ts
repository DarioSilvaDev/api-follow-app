import { ConflictException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AcceptConsignmentTakeQrHandler } from './accept-consignment-take.handler';
import { AcceptConsignmentTakeQrCommand } from './accept-consignment-take.command';

describe('AcceptConsignmentTakeQrHandler (Fase 2b — toma)', () => {
  let handler: AcceptConsignmentTakeQrHandler;
  let prismaMock: any;
  let eventEmitterMock: { emit: jest.Mock };

  const ctx = {
    type: 'DEALERSHIP',
    dealershipId: 'dealership-1',
    userId: 'user-member',
    memberId: 'member-1',
    roleId: 'role-1',
  } as any;

  const pendingQr = {
    id: 'qr-take',
    vehicleId: 'vehicle-1',
    createdByUserId: 'seller-1',
    status: 'pending',
    source: 'presencial',
    purpose: 'take',
    expiresAt: new Date(Date.now() + 3600_000),
  };

  const cmd = new AcceptConsignmentTakeQrCommand(
    pendingQr as any,
    'user-member',
    ctx,
  );

  // D-TL-19: miembro activo con permiso `dealership.vehicle.take` (owner/admin/
  // seller). Cada test puede sobreescribir `prismaMock.dealershipMember`.
  const activeMemberWithTake = {
    id: 'member-1',
    status: 'active',
    dealership: { isActive: true },
    role: {
      permissions: [{ permission: { code: 'dealership.vehicle.take' } }],
    },
  };

  beforeEach(() => {
    prismaMock = {
      dealership: {
        findUnique: jest.fn().mockResolvedValue({ isActive: true }),
      },
      dealershipMember: {
        findUnique: jest.fn().mockResolvedValue(activeMemberWithTake),
      },
      vehicleTransferQr: { updateMany: jest.fn() },
      vehicleOwnership: {
        findFirst: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
      },
      vehicleTransfer: { create: jest.fn() },
      vehicleTransferEvent: { create: jest.fn() },
      vehicleAccess: { findFirst: jest.fn(), create: jest.fn() },
      $transaction: jest.fn((cb) => cb(prismaMock)),
    };
    eventEmitterMock = { emit: jest.fn() };
    handler = new AcceptConsignmentTakeQrHandler(
      prismaMock,
      eventEmitterMock as any,
    );
  });

  it('happy path: cierra ownership del vendedor, crea titular company + transfer, access solo lectura, evento dedicado', async () => {
    prismaMock.vehicleTransferQr.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.vehicleOwnership.findFirst.mockResolvedValue({
      id: 'own-seller',
      vehicleId: 'vehicle-1',
      userId: 'seller-1',
    });
    prismaMock.vehicleAccess.findFirst.mockResolvedValue(null);
    prismaMock.vehicleTransfer.create.mockResolvedValue({
      id: 'transfer-take',
      status: 'completed',
    });

    const result = await handler.execute(cmd);

    // Gate one-shot + consumido por dealership + miembro actuante (XOR D-DB-1).
    expect(prismaMock.vehicleTransferQr.updateMany).toHaveBeenCalledWith({
      where: { id: 'qr-take', status: 'pending' },
      data: expect.objectContaining({
        status: 'consumed',
        consumedByDealershipId: 'dealership-1',
        consumedByMemberId: 'member-1',
      }),
    });
    expect(prismaMock.vehicleOwnership.update).toHaveBeenCalledWith({
      where: { id: 'own-seller' },
      data: { endsAt: expect.any(Date) },
    });
    expect(prismaMock.vehicleTransfer.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          fromUserId: 'seller-1',
          toDealershipId: 'dealership-1',
          status: 'completed',
        }),
      }),
    );
    expect(prismaMock.vehicleOwnership.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          dealershipId: 'dealership-1',
          type: 'company',
          acquiredByTransferId: 'transfer-take',
        }),
      }),
    );
    // M3/D-107: VehicleAccess de solo lectura para el vendedor (sin PII).
    expect(prismaMock.vehicleAccess.create).toHaveBeenCalledWith({
      data: {
        vehicleId: 'vehicle-1',
        userId: 'seller-1',
        grantedByUserId: 'user-member',
      },
    });
    // M4/D-TL-17: evento dedicado, no el clásico.
    expect(eventEmitterMock.emit).toHaveBeenCalledWith(
      'vehicle.consignment.taken',
      expect.any(Object),
    );
    expect(eventEmitterMock.emit).not.toHaveBeenCalledWith(
      'vehicle.transfer.accepted',
      expect.any(Object),
    );
    expect(result).toEqual({
      transferId: 'transfer-take',
      status: 'completed',
    });
  });

  it('409: la dealership ya es titular (auto-transfer bloqueado)', async () => {
    prismaMock.vehicleTransferQr.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.vehicleOwnership.findFirst.mockResolvedValue({
      id: 'own-1',
      dealershipId: 'dealership-1',
    });

    let thrown: any;
    try {
      await handler.execute(cmd);
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(ConflictException);
    expect(prismaMock.vehicleTransfer.create).not.toHaveBeenCalled();
  });

  it('409: el titular actual no es el vendedor que generó el QR', async () => {
    prismaMock.vehicleTransferQr.updateMany.mockResolvedValue({ count: 1 });
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
    expect(prismaMock.vehicleTransfer.create).not.toHaveBeenCalled();
  });

  it('H1 race: doble consumo del mismo QR → 409 sin efectos', async () => {
    prismaMock.vehicleTransferQr.updateMany.mockResolvedValue({ count: 0 });

    let thrown: any;
    try {
      await handler.execute(cmd);
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(ConflictException);
    expect(prismaMock.vehicleTransfer.create).not.toHaveBeenCalled();
    expect(eventEmitterMock.emit).not.toHaveBeenCalled();
  });

  it('M3: acceso vigente existente → no duplica VehicleAccess', async () => {
    prismaMock.vehicleTransferQr.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.vehicleOwnership.findFirst.mockResolvedValue({
      id: 'own-seller',
      vehicleId: 'vehicle-1',
      userId: 'seller-1',
    });
    prismaMock.vehicleAccess.findFirst.mockResolvedValue({
      id: 'access-active',
    });
    prismaMock.vehicleTransfer.create.mockResolvedValue({
      id: 'transfer-take',
      status: 'completed',
    });

    await expect(handler.execute(cmd)).resolves.toEqual({
      transferId: 'transfer-take',
      status: 'completed',
    });
    expect(prismaMock.vehicleAccess.create).not.toHaveBeenCalled();
  });

  it('M3: create de acceso con P2002 (row stale) → no resucita, no falla', async () => {
    prismaMock.vehicleTransferQr.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.vehicleOwnership.findFirst.mockResolvedValue({
      id: 'own-seller',
      vehicleId: 'vehicle-1',
      userId: 'seller-1',
    });
    prismaMock.vehicleAccess.findFirst.mockResolvedValue(null);
    prismaMock.vehicleAccess.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed on the fields: (`vehicleId`,`userId`)',
        { code: 'P2002', clientVersion: 'test' },
      ),
    );
    prismaMock.vehicleTransfer.create.mockResolvedValue({
      id: 'transfer-take',
      status: 'completed',
    });

    await expect(handler.execute(cmd)).resolves.toEqual({
      transferId: 'transfer-take',
      status: 'completed',
    });
    expect(prismaMock.vehicleAccess.create).toHaveBeenCalledTimes(1);
  });

  it('P2: concesionaria inactiva → 403 sin consumir el QR', async () => {
    prismaMock.dealership.findUnique.mockResolvedValue({ isActive: false });

    let thrown: any;
    try {
      await handler.execute(cmd);
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(ForbiddenException);
    expect(prismaMock.vehicleTransferQr.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.vehicleTransfer.create).not.toHaveBeenCalled();
    expect(eventEmitterMock.emit).not.toHaveBeenCalled();
  });

  it('P2: concesionaria inexistente → 403 fail-closed sin consumir el QR', async () => {
    prismaMock.dealership.findUnique.mockResolvedValue(null);

    let thrown: any;
    try {
      await handler.execute(cmd);
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(ForbiddenException);
    expect(prismaMock.vehicleTransferQr.updateMany).not.toHaveBeenCalled();
  });

  // ─────────────────────────────────────────────────────────────
  // D-TL-19 — enforcement de permiso `dealership.vehicle.take`
  // ─────────────────────────────────────────────────────────────
  it('403: miembro activo SIN permiso take → no consume el QR', async () => {
    prismaMock.dealershipMember.findUnique.mockResolvedValue({
      id: 'member-1',
      status: 'active',
      dealership: { isActive: true },
      role: {
        permissions: [{ permission: { code: 'history.view' } }],
      },
    });

    let thrown: any;
    try {
      await handler.execute(cmd);
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(ForbiddenException);
    expect(prismaMock.vehicleTransferQr.updateMany).not.toHaveBeenCalled();
  });

  it('403: miembro inactivo → no consume el QR (defensa en profundidad)', async () => {
    prismaMock.dealershipMember.findUnique.mockResolvedValue({
      id: 'member-1',
      status: 'inactive',
      dealership: { isActive: true },
      role: {
        permissions: [{ permission: { code: 'dealership.vehicle.take' } }],
      },
    });

    let thrown: any;
    try {
      await handler.execute(cmd);
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(ForbiddenException);
    expect(prismaMock.vehicleTransferQr.updateMany).not.toHaveBeenCalled();
  });

  it('403: miembro inexistente → fail-closed sin consumir el QR', async () => {
    prismaMock.dealershipMember.findUnique.mockResolvedValue(null);

    let thrown: any;
    try {
      await handler.execute(cmd);
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(ForbiddenException);
    expect(prismaMock.vehicleTransferQr.updateMany).not.toHaveBeenCalled();
  });
});
