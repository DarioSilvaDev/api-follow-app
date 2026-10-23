import { ForbiddenException, HttpStatus } from '@nestjs/common';
import { ERROR_CODES } from '../../../../common/exceptions/error-codes';
import { NotFoundException } from '../../../../common/exceptions/not-found.exception';
import { CurrentContext } from '../../../../common/context/interfaces/current-context.interface';
import { CorrectVinHandler } from './correct-vin.handler';
import { CorrectVinCommand } from './correct-vin.command';

/**
 * Gap 1 — D-03/D-144: corrección de VIN por comando dedicado.
 *
 * El handler NO reimplementa la autorización: delega en
 * `VehicleAccessService.getCapabilities(...)` con el contexto activo (misma
 * lógica que las demás escrituras). La matriz de autorización por rol/contexto
 * (owner personal, admin/owner de concesionaria titular, super_admin ✅;
 * seller / no-titular ❌) se resuelve en `getCapabilities` y se verifica en
 * `vehicle-access.service.spec.ts`; aquí se verifica que el handler respeta
 * `canCorrectVin` y no escribe nada si es `false`.
 *
 * Responsabilidades verificadas aquí:
 * - 404 antes de autorizar (incluye vehículo borrado).
 * - 403 cuando `canCorrectVin` es false → sin transacción y sin evento.
 * - Normalización del VIN (`trim` + `uppercase`) antes de persistir y en la auditoría.
 * - Auditoría `vin_corrected` con `previousValue`/`newValue`/`reason` dentro de
 *   la misma transacción (D-144) + lock `FOR UPDATE` (D-03).
 * - 409 si el VIN ya existe en otro vehículo.
 * - Atribución derivada del contexto (D-146): PERSONAL vs DEALERSHIP.
 * - Evento emitido SOLO después del commit.
 */
describe('CorrectVinHandler — Gap 1 (D-03/D-144/D-146)', () => {
  let handler: CorrectVinHandler;

  const personalContext: CurrentContext = { type: 'PERSONAL', userId: 'u1' };
  const dealershipContext: CurrentContext = {
    type: 'DEALERSHIP',
    userId: 'u1',
    dealershipId: 'd1',
    memberId: 'm1',
    roleId: 'r1',
  };

  let prismaMock: {
    vehicle: { findUnique: jest.Mock };
    $transaction: jest.Mock;
  };
  let txMock: {
    $queryRaw: jest.Mock;
    vehicle: { update: jest.Mock; findUnique: jest.Mock };
    vehicleAuditLog: { create: jest.Mock };
  };
  let eventEmitterMock: { emit: jest.Mock };
  let vehicleAccessMock: { getCapabilities: jest.Mock };

  const previousVin = 'JH4KA7561PC008269';
  const normalizedVin = '1HGCM82633A004352';
  // Entrada deliberadamente en minúsculas y con espacios para probar la normalización.
  const baseDto = { vin: '  1hgcm82633a004352  ', reason: 'VIN mal tipeado en el alta' };

  beforeEach(() => {
    txMock = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'v1' }]),
      vehicle: {
        update: jest.fn().mockResolvedValue({ id: 'v1' }),
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 'v1', vin: normalizedVin }),
      },
      vehicleAuditLog: { create: jest.fn().mockResolvedValue({ id: 'a1' }) },
    };

    prismaMock = {
      vehicle: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 'v1', vin: previousVin, deletedAt: null }),
      },
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

    handler = new CorrectVinHandler(
      prismaMock as any,
      eventEmitterMock as any,
      vehicleAccessMock as any,
    );
  });

  const cmd = (
    context?: CurrentContext,
    overrides: Partial<typeof baseDto> = {},
  ) =>
    new CorrectVinCommand('v1', { ...baseDto, ...overrides }, 'u1', context);

  it('vehículo inexistente → 404 y no autoriza ni escribe', async () => {
    prismaMock.vehicle.findUnique.mockResolvedValue(null);

    await expect(handler.execute(cmd(personalContext))).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(vehicleAccessMock.getCapabilities).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('vehículo borrado (deletedAt) → 404', async () => {
    prismaMock.vehicle.findUnique.mockResolvedValue({
      id: 'v1',
      vin: previousVin,
      deletedAt: new Date(),
    });

    await expect(handler.execute(cmd(personalContext))).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('sin capacidad de corrección (seller / no titular) → 403 sin transacción ni evento', async () => {
    vehicleAccessMock.getCapabilities.mockResolvedValue({
      canEdit: false,
      canRecordMileage: false,
      canCorrectVin: false,
    });

    await expect(handler.execute(cmd(personalContext))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(eventEmitterMock.emit).not.toHaveBeenCalled();
  });

  it('con capacidad (owner personal / admin titular / super_admin) → corrige, audita y emite', async () => {
    const result = await handler.execute(cmd(personalContext));

    expect(result).toEqual({ id: 'v1', vin: normalizedVin });
    expect(txMock.vehicle.update).toHaveBeenCalledWith({
      where: { id: 'v1' },
      data: { vin: normalizedVin },
    });
    expect(eventEmitterMock.emit).toHaveBeenCalledWith(
      'vehicle.vin.corrected',
      expect.anything(),
    );
  });

  it('delega la autorización con el contexto activo y el actor', async () => {
    await handler.execute(cmd(personalContext));

    expect(vehicleAccessMock.getCapabilities).toHaveBeenCalledWith({
      vehicleId: 'v1',
      userId: 'u1',
      context: personalContext,
    });
  });

  it('normaliza el VIN (trim + uppercase) antes de persistir', async () => {
    await handler.execute(cmd(personalContext, { vin: '  jh4ka7561pc008269 ' }));

    expect(txMock.vehicle.update).toHaveBeenCalledWith({
      where: { id: 'v1' },
      data: { vin: 'JH4KA7561PC008269' },
    });
    expect(txMock.vehicleAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ newValue: 'JH4KA7561PC008269' }),
    });
  });

  it('audita vin_corrected con previousValue/newValue/reason (PERSONAL)', async () => {
    await handler.execute(cmd(personalContext));

    expect(txMock.vehicleAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        vehicleId: 'v1',
        action: 'vin_corrected',
        field: 'vin',
        previousValue: previousVin,
        newValue: normalizedVin,
        reason: baseDto.reason,
        actorUserId: 'u1',
        dealershipId: null,
        dealershipMemberId: null,
        contextType: 'personal',
      }),
    });
  });

  it('en contexto DEALERSHIP atribuye dealershipId/memberId y contextType dealership (D-146)', async () => {
    await handler.execute(cmd(dealershipContext));

    expect(vehicleAccessMock.getCapabilities).toHaveBeenCalledWith({
      vehicleId: 'v1',
      userId: 'u1',
      context: dealershipContext,
    });
    expect(txMock.vehicleAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        dealershipId: 'd1',
        dealershipMemberId: 'm1',
        contextType: 'dealership',
      }),
    });
  });

  it('el lock (FOR UPDATE) corre antes de escribir en la transacción', async () => {
    await handler.execute(cmd(personalContext));

    const lockOrder = txMock.$queryRaw.mock.invocationCallOrder[0];
    const updateOrder = txMock.vehicle.update.mock.invocationCallOrder[0];
    expect(lockOrder).toBeLessThan(updateOrder);
  });

  it('VIN ya existente en otro vehículo → 409 CONFLICT y sin transacción', async () => {
    prismaMock.vehicle.findUnique
      .mockResolvedValueOnce({ id: 'v1', vin: previousVin, deletedAt: null })
      .mockResolvedValueOnce({ id: 'v-other' });

    await expect(handler.execute(cmd(personalContext))).rejects.toMatchObject({
      status: HttpStatus.CONFLICT,
      response: {
        code: ERROR_CODES.CONFLICT,
        errors: { vin: 'vin already exists' },
      },
    });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(eventEmitterMock.emit).not.toHaveBeenCalled();
  });

  it('el mismo VIN del propio vehículo no colisiona (no 409)', async () => {
    prismaMock.vehicle.findUnique
      .mockResolvedValueOnce({ id: 'v1', vin: previousVin, deletedAt: null })
      .mockResolvedValueOnce({ id: 'v1' });

    await expect(handler.execute(cmd(personalContext))).resolves.toBeDefined();
  });

  it('si el vehículo desaparece dentro de la transacción (lock vacío) → 404', async () => {
    txMock.$queryRaw.mockResolvedValue([]);

    await expect(handler.execute(cmd(personalContext))).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(txMock.vehicle.update).not.toHaveBeenCalled();
    expect(eventEmitterMock.emit).not.toHaveBeenCalled();
  });

  it('si la transacción falla no emite evento (post-commit)', async () => {
    txMock.vehicle.update.mockRejectedValue(new Error('db down'));

    await expect(handler.execute(cmd(personalContext))).rejects.toThrow(
      'db down',
    );
    expect(eventEmitterMock.emit).not.toHaveBeenCalled();
  });
});
