import { ForbiddenException, HttpStatus } from '@nestjs/common';
import { MileageSource } from '@prisma/client';
import { ERROR_CODES } from '../../../../common/exceptions/error-codes';
import { NotFoundException } from '../../../../common/exceptions/not-found.exception';
import { CurrentContext } from '../../../../common/context/interfaces/current-context.interface';
import { RecordMileageHandler } from './record-mileage.handler';
import { RecordMileageCommand } from './record-mileage.command';

/**
 * Gap 1 — D-05/D-06/D-02: kilometraje con `source` derivado, monotónía bajo
 * lock de fila, auditoría transaccional y fallo cerrado por contexto.
 */
describe('RecordMileageHandler — Gap 1 (contexto, lock, auditoría, evento)', () => {
  let handler: RecordMileageHandler;

  const personalContext: CurrentContext = { type: 'PERSONAL', userId: 'u1' };
  const dealershipContext: CurrentContext = {
    type: 'DEALERSHIP',
    userId: 'u1',
    dealershipId: 'd1',
    memberId: 'm1',
    roleId: 'r1',
  };
  const workshopContext: CurrentContext = {
    type: 'WORKSHOP',
    userId: 'u1',
    workshopId: 'w1',
    memberId: 'wm1',
    roleId: 'wr1',
  };
  const platformContext: CurrentContext = { type: 'PLATFORM', userId: 'u1' };

  let prismaMock: {
    vehicle: { findUnique: jest.Mock };
    $transaction: jest.Mock;
  };
  let txMock: {
    $queryRaw: jest.Mock;
    vehicleMileage: { aggregate: jest.Mock; create: jest.Mock };
    vehicleAuditLog: { create: jest.Mock };
  };
  let eventEmitterMock: { emit: jest.Mock };
  let vehicleAccessMock: { getCapabilities: jest.Mock };

  const baseDto = { mileage: 50000, notes: undefined };

  beforeEach(() => {
    txMock = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'v1' }]),
      vehicleMileage: {
        aggregate: jest.fn().mockResolvedValue({ _max: { mileage: null } }),
        create: jest.fn().mockResolvedValue({ id: 'mi1', mileage: 50000 }),
      },
      vehicleAuditLog: { create: jest.fn().mockResolvedValue({ id: 'a1' }) },
    };

    prismaMock = {
      vehicle: { findUnique: jest.fn().mockResolvedValue({ id: 'v1' }) },
      $transaction: jest.fn(async (cb: (tx: unknown) => unknown) => cb(txMock)),
    };

    eventEmitterMock = { emit: jest.fn() };
    vehicleAccessMock = {
      getCapabilities: jest.fn().mockResolvedValue({
        canEdit: true,
        canRecordMileage: true,
        canCorrectVin: true,
      }),
    };

    handler = new RecordMileageHandler(
      prismaMock as any,
      eventEmitterMock as any,
      vehicleAccessMock as any,
    );
  });

  const cmd = (
    context: CurrentContext,
    overrides: Partial<typeof baseDto> = {},
  ) =>
    new RecordMileageCommand('v1', { ...baseDto, ...overrides }, 'u1', context);

  it('contexto WORKSHOP → 403 sin tocar la base', async () => {
    await expect(handler.execute(cmd(workshopContext))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prismaMock.vehicle.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('contexto PLATFORM → 403 sin tocar la base', async () => {
    await expect(handler.execute(cmd(platformContext))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('vehículo inexistente → 404 y no autoriza', async () => {
    prismaMock.vehicle.findUnique.mockResolvedValue(null);

    await expect(handler.execute(cmd(personalContext))).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(vehicleAccessMock.getCapabilities).not.toHaveBeenCalled();
  });

  it('sin capacidad de registrar km → 403 y sin transacción', async () => {
    vehicleAccessMock.getCapabilities.mockResolvedValue({
      canEdit: false,
      canRecordMileage: false,
      canCorrectVin: false,
    });

    await expect(handler.execute(cmd(personalContext))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('PERSONAL deriva source=owner y atribución persona, con auditoría y evento', async () => {
    txMock.vehicleMileage.aggregate.mockResolvedValue({
      _max: { mileage: 40000 },
    });

    await handler.execute(cmd(personalContext, { mileage: 50000 }));

    expect(txMock.$queryRaw).toHaveBeenCalledTimes(1);
    expect(txMock.vehicleMileage.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        vehicleId: 'v1',
        mileage: 50000,
        source: MileageSource.owner,
        recordedByUserId: 'u1',
        recordedByDealershipId: null,
        recordedByDealershipMemberId: null,
      }),
    });
    expect(txMock.vehicleAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'mileage_recorded',
        field: 'mileage',
        previousValue: '40000',
        newValue: '50000',
        actorUserId: 'u1',
        contextType: 'personal',
      }),
    });
    expect(eventEmitterMock.emit).toHaveBeenCalledWith(
      'vehicle.mileage.recorded',
      expect.anything(),
    );
  });

  it('DEALERSHIP deriva source=dealership y atribución de concesionaria', async () => {
    await handler.execute(cmd(dealershipContext, { mileage: 100 }));

    expect(txMock.vehicleMileage.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        source: MileageSource.dealership,
        recordedByUserId: 'u1',
        recordedByDealershipId: 'd1',
        recordedByDealershipMemberId: 'm1',
      }),
    });
    expect(txMock.vehicleAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        dealershipId: 'd1',
        dealershipMemberId: 'm1',
        contextType: 'dealership',
      }),
    });
  });

  it('km menor al máximo histórico → 409 CONFLICT y sin insert', async () => {
    txMock.vehicleMileage.aggregate.mockResolvedValue({
      _max: { mileage: 60000 },
    });

    await expect(
      handler.execute(cmd(personalContext, { mileage: 59999 })),
    ).rejects.toMatchObject({
      status: HttpStatus.CONFLICT,
      response: {
        code: ERROR_CODES.CONFLICT,
        errors: {
          mileage: 'km must be greater than or equal to last recorded',
        },
      },
    });
    expect(txMock.vehicleMileage.create).not.toHaveBeenCalled();
    expect(txMock.vehicleAuditLog.create).not.toHaveBeenCalled();
    expect(eventEmitterMock.emit).not.toHaveBeenCalled();
  });

  it('km igual al máximo histórico se permite', async () => {
    txMock.vehicleMileage.aggregate.mockResolvedValue({
      _max: { mileage: 50000 },
    });

    await handler.execute(cmd(personalContext, { mileage: 50000 }));

    expect(txMock.vehicleMileage.create).toHaveBeenCalled();
  });

  it('sin lecturas previas se permite cualquier km >= 0', async () => {
    await handler.execute(cmd(personalContext, { mileage: 0 }));

    expect(txMock.vehicleMileage.create).toHaveBeenCalled();
    expect(txMock.vehicleAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ previousValue: null, newValue: '0' }),
    });
  });

  it('el lock (FOR UPDATE) corre antes de leer el máximo', async () => {
    await handler.execute(cmd(personalContext));

    const lockOrder = txMock.$queryRaw.mock.invocationCallOrder[0];
    const aggregateOrder =
      txMock.vehicleMileage.aggregate.mock.invocationCallOrder[0];
    expect(lockOrder).toBeLessThan(aggregateOrder);
  });

  it('si la transacción falla no emite evento', async () => {
    txMock.vehicleMileage.create.mockRejectedValue(new Error('db down'));

    await expect(handler.execute(cmd(personalContext))).rejects.toThrow(
      'db down',
    );
    expect(eventEmitterMock.emit).not.toHaveBeenCalled();
  });

  it('si el vehículo desaparece dentro de la transacción (lock vacío) → 404', async () => {
    txMock.$queryRaw.mockResolvedValue([]);

    await expect(handler.execute(cmd(personalContext))).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(txMock.vehicleMileage.create).not.toHaveBeenCalled();
  });
});
