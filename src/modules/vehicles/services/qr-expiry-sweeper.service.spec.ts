import { QrExpirySweeperService } from './qr-expiry-sweeper.service';

describe('QrExpirySweeperService (D-TL-6 / D-088)', () => {
  let service: QrExpirySweeperService;
  let prismaMock: any;
  let eventEmitterMock: { emit: jest.Mock };

  beforeEach(() => {
    prismaMock = {
      vehicleTransferQr: { findMany: jest.fn(), updateMany: jest.fn() },
    };
    eventEmitterMock = { emit: jest.fn() };
    service = new QrExpirySweeperService(prismaMock, eventEmitterMock as any);
  });

  it('scopes the query to pending + expiresAt < now (batch 100)', async () => {
    prismaMock.vehicleTransferQr.findMany.mockResolvedValue([]);

    await service.run();

    expect(prismaMock.vehicleTransferQr.findMany).toHaveBeenCalledWith({
      where: { status: 'pending', expiresAt: { lt: expect.any(Date) } },
      select: { id: true, vehicleId: true, createdByUserId: true },
      take: 100,
    });
  });

  it('marks only updated pending-expired QRs and emits for each', async () => {
    prismaMock.vehicleTransferQr.findMany.mockResolvedValue([
      { id: 'qr-1', vehicleId: 'v-1', createdByUserId: 'u-1' },
      { id: 'qr-2', vehicleId: 'v-1', createdByUserId: 'u-2' },
    ]);
    prismaMock.vehicleTransferQr.updateMany.mockResolvedValue({ count: 2 });

    const result = await service.run();

    // updateMany re-chequea status='pending' (idempotente frente al lazy)
    expect(prismaMock.vehicleTransferQr.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['qr-1', 'qr-2'] }, status: 'pending' },
      data: { status: 'expired' },
    });
    expect(eventEmitterMock.emit).toHaveBeenCalledTimes(2);
    expect(eventEmitterMock.emit).toHaveBeenCalledWith(
      'vehicle.transfer.qr_expired',
      expect.objectContaining({
        qrId: 'qr-1',
        vehicleId: 'v-1',
        createdByUserId: 'u-1',
      }),
    );
    expect(result).toEqual({ expired: 2 });
  });

  it('emits only ids.slice(0, count) when count < ids.length (lazy already emitted the rest)', async () => {
    prismaMock.vehicleTransferQr.findMany.mockResolvedValue([
      { id: 'qr-1', vehicleId: 'v-1', createdByUserId: 'u-1' },
      { id: 'qr-2', vehicleId: 'v-1', createdByUserId: 'u-2' },
      { id: 'qr-3', vehicleId: 'v-2', createdByUserId: 'u-3' },
    ]);
    // Solo qr-1 fue actualizado por el sweeper: qr-2/qr-3 ya los marcó/emitió
    // el lazy-on-read entre el findMany y el updateMany → NO re-emitir.
    prismaMock.vehicleTransferQr.updateMany.mockResolvedValue({ count: 1 });

    const result = await service.run();

    expect(eventEmitterMock.emit).toHaveBeenCalledTimes(1);
    expect(eventEmitterMock.emit).toHaveBeenCalledWith(
      'vehicle.transfer.qr_expired',
      expect.objectContaining({ qrId: 'qr-1' }),
    );
    expect(result).toEqual({ expired: 1 });
  });

  it('no-op when there are no pending-expired QRs (no updateMany, no emit)', async () => {
    prismaMock.vehicleTransferQr.findMany.mockResolvedValue([]);

    const result = await service.run();

    expect(prismaMock.vehicleTransferQr.updateMany).not.toHaveBeenCalled();
    expect(eventEmitterMock.emit).not.toHaveBeenCalled();
    expect(result).toEqual({ expired: 0 });
  });

  it('does not fire for non-pending QRs: a consumed QR is not picked up', async () => {
    // findMany solo devuelve pending; un QR consumed/revoked no entra al batch.
    prismaMock.vehicleTransferQr.findMany.mockResolvedValue([]);

    await service.run();

    expect(prismaMock.vehicleTransferQr.updateMany).not.toHaveBeenCalled();
  });

  it('does not start the interval timer in NODE_ENV=test', () => {
    expect(process.env.NODE_ENV).toBe('test');
    service.onModuleInit();
    expect((service as any).timer).toBeNull();
  });

  it('onModuleDestroy clears the interval', () => {
    (service as any).timer = setInterval(() => undefined, 60_000);
    service.onModuleDestroy();
    expect((service as any).timer).toBeNull();
  });
});
