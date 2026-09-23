import { ConflictException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { GenerateConsignmentQrHandler } from './generate-consignment-qr.handler';
import { GenerateConsignmentQrCommand } from './generate-consignment-qr.command';

describe('GenerateConsignmentQrHandler (Fase 2b)', () => {
  let handler: GenerateConsignmentQrHandler;
  let prismaMock: any;
  let eventEmitterMock: { emit: jest.Mock };

  const personalCtx = { type: 'PERSONAL' } as any;
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
        create: jest.fn(),
      },
      vehicleTransfer: { findFirst: jest.fn() },
      dealershipMember: { findUnique: jest.fn() },
    };
    eventEmitterMock = { emit: jest.fn() };
    handler = new GenerateConsignmentQrHandler(
      prismaMock,
      eventEmitterMock as any,
    );
  });

  const mockCreateQr = (purpose?: string) =>
    prismaMock.vehicleTransferQr.create.mockResolvedValue({
      id: 'qr-1',
      token: 'a'.repeat(32),
      source: 'presencial',
      purpose,
      expiresAt: new Date(Date.now() + 3600_000),
    });

  const sellerOwned = () =>
    prismaMock.vehicle.findUnique.mockResolvedValue({
      id: 'vehicle-1',
      ownerships: [{ userId: 'user-1' }],
    });

  it('take immediate: TTL 3600s, createdByDealershipId null, source presencial', async () => {
    sellerOwned();
    prismaMock.vehicleTransferQr.findFirst.mockResolvedValue(null);
    prismaMock.vehicleTransfer.findFirst.mockResolvedValue(null);
    mockCreateQr('take');

    const before = Date.now();
    const result = await handler.execute(
      new GenerateConsignmentQrCommand(
        'vehicle-1',
        'user-1',
        'take',
        personalCtx,
        'immediate',
      ),
    );

    const createData =
      prismaMock.vehicleTransferQr.create.mock.calls[0][0].data;
    expect(createData.purpose).toBe('take');
    expect(createData.createdByDealershipId).toBeNull();
    expect(createData.createdByUserId).toBe('user-1');
    expect(createData.source).toBe('presencial');
    const ttlMs = createData.expiresAt.getTime() - before;
    expect(ttlMs).toBeGreaterThan(3599_000);
    expect(ttlMs).toBeLessThanOrEqual(3_601_000);
    expect(result.secondsRemaining).toBe(3600);
    expect(result.url).toContain('/transfer/qr/');
    expect(result.token).toHaveLength(32);
  });

  it('take pickup: TTL 172800s (2 días)', async () => {
    sellerOwned();
    prismaMock.vehicleTransferQr.findFirst.mockResolvedValue(null);
    prismaMock.vehicleTransfer.findFirst.mockResolvedValue(null);
    mockCreateQr('take');

    const before = Date.now();
    const result = await handler.execute(
      new GenerateConsignmentQrCommand(
        'vehicle-1',
        'user-1',
        'take',
        personalCtx,
        'pickup',
      ),
    );

    const createData =
      prismaMock.vehicleTransferQr.create.mock.calls[0][0].data;
    const ttlMs = createData.expiresAt.getTime() - before;
    expect(ttlMs).toBeGreaterThan(172_799_000);
    expect(ttlMs).toBeLessThanOrEqual(172_801_000);
    expect(result.secondsRemaining).toBe(172800);
  });

  it('take en contexto DEALERSHIP → 403', async () => {
    let thrown: any;
    try {
      await handler.execute(
        new GenerateConsignmentQrCommand(
          'vehicle-1',
          'user-member',
          'take',
          dealershipCtx,
        ),
      );
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(ForbiddenException);
    expect(prismaMock.vehicleTransferQr.create).not.toHaveBeenCalled();
  });

  it('take: no titular (owner persona distinto) → 403', async () => {
    prismaMock.vehicle.findUnique.mockResolvedValue({
      id: 'vehicle-1',
      ownerships: [{ userId: 'other-owner' }],
    });

    let thrown: any;
    try {
      await handler.execute(
        new GenerateConsignmentQrCommand(
          'vehicle-1',
          'user-1',
          'take',
          personalCtx,
        ),
      );
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(ForbiddenException);
    expect(prismaMock.vehicleTransferQr.create).not.toHaveBeenCalled();
  });

  it('sale: miembro activo con permiso sell genera QR con origen dealership', async () => {
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
    prismaMock.vehicleTransfer.findFirst.mockResolvedValue(null);
    mockCreateQr('sale');

    const result = await handler.execute(
      new GenerateConsignmentQrCommand(
        'vehicle-1',
        'user-member',
        'sale',
        dealershipCtx,
      ),
    );

    const createData =
      prismaMock.vehicleTransferQr.create.mock.calls[0][0].data;
    expect(createData.purpose).toBe('sale');
    expect(createData.createdByDealershipId).toBe('dealership-1');
    expect(createData.createdByUserId).toBe('user-member');
    expect(result.purpose).toBe('sale');
  });

  it('sale: sin permiso dealership.vehicle.sell → 403', async () => {
    prismaMock.dealershipMember.findUnique.mockResolvedValue({
      status: 'active',
      dealership: { isActive: true },
      role: {
        permissions: [{ permission: { code: 'dealership.vehicle.return' } }],
      },
    });

    let thrown: any;
    try {
      await handler.execute(
        new GenerateConsignmentQrCommand(
          'vehicle-1',
          'user-member',
          'sale',
          dealershipCtx,
        ),
      );
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(ForbiddenException);
    expect(prismaMock.vehicleTransferQr.create).not.toHaveBeenCalled();
  });

  it('sale: la dealership no es la titular actual (type company) → 403', async () => {
    prismaMock.dealershipMember.findUnique.mockResolvedValue({
      status: 'active',
      dealership: { isActive: true },
      role: {
        permissions: [{ permission: { code: 'dealership.vehicle.sell' } }],
      },
    });
    prismaMock.vehicle.findUnique.mockResolvedValue({
      id: 'vehicle-1',
      ownerships: [{ dealershipId: 'other-dealership', type: 'company' }],
    });

    let thrown: any;
    try {
      await handler.execute(
        new GenerateConsignmentQrCommand(
          'vehicle-1',
          'user-member',
          'sale',
          dealershipCtx,
        ),
      );
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(ForbiddenException);
  });

  it('return: requiere permiso dealership.vehicle.return', async () => {
    prismaMock.dealershipMember.findUnique.mockResolvedValue({
      status: 'active',
      dealership: { isActive: true },
      role: { permissions: [] },
    });

    let thrown: any;
    try {
      await handler.execute(
        new GenerateConsignmentQrCommand(
          'vehicle-1',
          'user-member',
          'return',
          dealershipCtx,
        ),
      );
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(ForbiddenException);
    expect(prismaMock.vehicleTransferQr.create).not.toHaveBeenCalled();
  });

  it('409: existe un QR pending activo para el vehículo', async () => {
    sellerOwned();
    prismaMock.vehicleTransferQr.findFirst
      .mockResolvedValueOnce(null) // stale
      .mockResolvedValueOnce({ id: 'qr-pending', status: 'pending' }); // activo
    prismaMock.vehicleTransfer.findFirst.mockResolvedValue(null);

    let thrown: any;
    try {
      await handler.execute(
        new GenerateConsignmentQrCommand(
          'vehicle-1',
          'user-1',
          'take',
          personalCtx,
        ),
      );
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(ConflictException);
    expect(prismaMock.vehicleTransferQr.create).not.toHaveBeenCalled();
  });

  it('D-079: lazy-expire del pending vencido + evento qr_expired, luego crea', async () => {
    sellerOwned();
    prismaMock.vehicleTransferQr.findFirst
      .mockResolvedValueOnce({
        id: 'qr-stale',
        vehicleId: 'vehicle-1',
        createdByUserId: 'user-1',
        status: 'pending',
      })
      .mockResolvedValueOnce(null); // activo
    prismaMock.vehicleTransfer.findFirst.mockResolvedValue(null);
    mockCreateQr('take');

    await handler.execute(
      new GenerateConsignmentQrCommand(
        'vehicle-1',
        'user-1',
        'take',
        personalCtx,
      ),
    );

    expect(prismaMock.vehicleTransferQr.update).toHaveBeenCalledWith({
      where: { id: 'qr-stale' },
      data: { status: 'expired' },
    });
    expect(eventEmitterMock.emit).toHaveBeenCalledWith(
      'vehicle.transfer.qr_expired',
      expect.any(Object),
    );
    expect(prismaMock.vehicleTransferQr.create).toHaveBeenCalledTimes(1);
  });

  it('D-079: red de seguridad P2002 (carrera) → 409', async () => {
    sellerOwned();
    prismaMock.vehicleTransferQr.findFirst.mockResolvedValue(null);
    prismaMock.vehicleTransfer.findFirst.mockResolvedValue(null);
    prismaMock.vehicleTransferQr.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed on the fields: (`vehicleId`)',
        { code: 'P2002', clientVersion: 'test' },
      ),
    );

    let thrown: any;
    try {
      await handler.execute(
        new GenerateConsignmentQrCommand(
          'vehicle-1',
          'user-1',
          'take',
          personalCtx,
        ),
      );
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(ConflictException);
  });

  it('P2: concesionaria inactiva → 403 sin emitir QR', async () => {
    prismaMock.dealershipMember.findUnique.mockResolvedValue({
      status: 'active',
      dealership: { isActive: false },
      role: {
        permissions: [{ permission: { code: 'dealership.vehicle.sell' } }],
      },
    });

    let thrown: any;
    try {
      await handler.execute(
        new GenerateConsignmentQrCommand(
          'vehicle-1',
          'user-member',
          'sale',
          dealershipCtx,
        ),
      );
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(ForbiddenException);
    expect(prismaMock.vehicleTransferQr.create).not.toHaveBeenCalled();
  });
});
