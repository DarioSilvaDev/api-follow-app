import {
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { NotFoundException } from '../../../../common/exceptions/not-found.exception';
import { CloseCareEpisodeDto } from '../../dto/close-care-episode.dto';
import { CloseCareEpisodeCommand } from './close-care-episode.command';
import { CloseCareEpisodeHandler } from './close-care-episode.handler';

describe('CloseCareEpisodeHandler — B-3 cierre de atención', () => {
  let handler: CloseCareEpisodeHandler;
  let prismaMock: {
    careEpisode: {
      findFirst: jest.Mock;
      aggregate: jest.Mock;
      update: jest.Mock;
    };
    vehicleMileage: { aggregate: jest.Mock };
    careEpisodeAttachment: { count: jest.Mock };
    serviceType: { findMany: jest.Mock };
    careEpisodeServiceType: { findMany: jest.Mock };
    $queryRaw: jest.Mock;
    $transaction: jest.Mock;
  };
  let eventEmitterMock: { emit: jest.Mock };

  const careEpisodeId = 'ce-1';
  const vehicleId = 'v-1';
  const workshopId = 'w1';
  const memberId = 'member-1';
  const closedAt = new Date('2026-11-03T12:00:00.000Z');
  const resumen = 'Cambio de aceite y filtro; sin novedades mecánicas';

  function makeDto(
    overrides: Partial<CloseCareEpisodeDto> = {},
  ): CloseCareEpisodeDto {
    return {
      mileageOut: 45500,
      serviceTypeIds: ['st-1'],
      closeNotes: resumen,
      ...overrides,
    };
  }

  function makeCommand(overrides: Partial<CloseCareEpisodeDto> = {}) {
    return new CloseCareEpisodeCommand(
      careEpisodeId,
      makeDto(overrides),
      workshopId,
      memberId,
    );
  }

  beforeEach(() => {
    prismaMock = {
      careEpisode: {
        findFirst: jest.fn(),
        aggregate: jest.fn(),
        update: jest.fn(),
      },
      vehicleMileage: { aggregate: jest.fn() },
      careEpisodeAttachment: { count: jest.fn() },
      serviceType: { findMany: jest.fn() },
      careEpisodeServiceType: { findMany: jest.fn() },
      $queryRaw: jest.fn(),
      $transaction: jest.fn(async (cb: (tx: unknown) => unknown) =>
        cb(prismaMock),
      ),
    };
    eventEmitterMock = { emit: jest.fn() };
    handler = new CloseCareEpisodeHandler(
      prismaMock as any,
      eventEmitterMock as unknown as EventEmitter2,
    );

    // Defaults del happy path.
    prismaMock.careEpisode.findFirst.mockResolvedValue({
      id: careEpisodeId,
      vehicleId,
      status: 'open',
      mileageIn: 45000,
    });
    prismaMock.$queryRaw.mockResolvedValue([
      {
        status: 'open',
        workshop_id: workshopId,
        vehicle_id: vehicleId,
        mileage_in: 45000,
      },
    ]);
    prismaMock.careEpisodeAttachment.count.mockResolvedValue(0);
    prismaMock.serviceType.findMany.mockResolvedValue([{ id: 'st-1' }]);
    prismaMock.careEpisodeServiceType.findMany.mockResolvedValue([]);
    prismaMock.careEpisode.aggregate.mockResolvedValue({
      _max: { mileageIn: 45000, mileageOut: null },
    });
    prismaMock.vehicleMileage.aggregate.mockResolvedValue({
      _max: { mileage: null },
    });
    prismaMock.careEpisode.update.mockResolvedValue({
      id: careEpisodeId,
      status: 'delivered',
      closedAt,
      mileageOut: 45500,
      mileageOutUnreadable: false,
    });
  });

  // ──────────────────────────────────────────────────────
  // Happy path
  // ──────────────────────────────────────────────────────

  it('cierra la atención (open → delivered) y emite el evento post-commit', async () => {
    const result = await handler.execute(makeCommand());

    expect(result).toEqual({
      data: {
        id: careEpisodeId,
        status: 'delivered',
        closedAt,
        mileageOut: 45500,
        mileageOutUnreadable: false,
        mileageOutlier: false,
      },
    });

    expect(prismaMock.careEpisode.update).toHaveBeenCalledWith({
      where: { id: careEpisodeId },
      data: {
        status: 'delivered',
        closedAt: expect.any(Date),
        closedByMemberId: memberId,
        mileageOut: 45500,
        mileageOutUnreadable: false,
        mileageOutUnreadableReason: null,
        closeNotes: resumen,
        serviceTypes: {
          create: [{ serviceTypeId: 'st-1', customLabel: null }],
        },
      },
      select: {
        id: true,
        status: true,
        closedAt: true,
        mileageOut: true,
        mileageOutUnreadable: true,
      },
    });

    expect(eventEmitterMock.emit).toHaveBeenCalledTimes(1);
    expect(eventEmitterMock.emit).toHaveBeenCalledWith(
      'care-episode.closed',
      expect.objectContaining({
        careEpisodeId,
        vehicleId,
        workshopId,
        memberId,
      }),
    );
  });

  it('persiste closeNotes recortado (diagnóstico + motivo "tablero reemplazado")', async () => {
    await handler.execute(
      makeCommand({ closeNotes: '  Diagnóstico escáner: tablero reemplazado  ' }),
    );

    expect(prismaMock.careEpisode.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          closeNotes: 'Diagnóstico escáner: tablero reemplazado',
        }),
      }),
    );
  });

  it('rechaza el cierre sin diagnóstico/resumen (D-207) sin persistir ni emitir', async () => {
    await expect(
      handler.execute(makeCommand({ closeNotes: undefined as unknown as string })),
    ).rejects.toThrow(BadRequestException);

    expect(prismaMock.careEpisode.update).not.toHaveBeenCalled();
    expect(eventEmitterMock.emit).not.toHaveBeenCalled();
  });

  it('rechaza un resumen más corto que el mínimo de 10 caracteres', async () => {
    await expect(
      handler.execute(makeCommand({ closeNotes: 'aceite' })),
    ).rejects.toThrow(BadRequestException);

    expect(prismaMock.careEpisode.update).not.toHaveBeenCalled();
  });

  it('no agrega tipos cuando el episodio ya los tiene y no se envían', async () => {
    prismaMock.careEpisodeServiceType.findMany.mockResolvedValue([
      { serviceTypeId: 'st-1', customLabel: null },
    ]);

    await handler.execute(makeCommand({ serviceTypeIds: undefined }));

    const updateArg = prismaMock.careEpisode.update.mock.calls[0][0];
    expect(updateArg.data.serviceTypes).toBeUndefined();
  });

  it('deduplica tipos ya cargados en el check-in (reenviar chips no duplica)', async () => {
    prismaMock.careEpisodeServiceType.findMany.mockResolvedValue([
      { serviceTypeId: 'st-1', customLabel: null },
      { serviceTypeId: null, customLabel: 'Detailing' },
    ]);

    await handler.execute(
      makeCommand({
        serviceTypeIds: ['st-1'],
        customServiceLabel: 'detailing',
      }),
    );

    const updateArg = prismaMock.careEpisode.update.mock.calls[0][0];
    expect(updateArg.data.serviceTypes).toBeUndefined();
  });

  it('agrega sólo los tipos nuevos al total existente', async () => {
    prismaMock.careEpisodeServiceType.findMany.mockResolvedValue([
      { serviceTypeId: 'st-1', customLabel: null },
    ]);
    prismaMock.serviceType.findMany.mockResolvedValue([{ id: 'st-2' }]);

    await handler.execute(makeCommand({ serviceTypeIds: ['st-1', 'st-2'] }));

    expect(prismaMock.careEpisode.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          serviceTypes: {
            create: [{ serviceTypeId: 'st-2', customLabel: null }],
          },
        }),
      }),
    );
  });

  // ──────────────────────────────────────────────────────
  // Odómetro
  // ──────────────────────────────────────────────────────

  it('acepta "no legible" con motivo y foto after; persiste sin valor', async () => {
    prismaMock.careEpisodeAttachment.count.mockResolvedValue(1);
    prismaMock.careEpisode.update.mockResolvedValue({
      id: careEpisodeId,
      status: 'delivered',
      closedAt,
      mileageOut: null,
      mileageOutUnreadable: true,
    });

    const result = await handler.execute(
      makeCommand({
        mileageOut: undefined,
        mileageOutUnreadable: true,
        mileageOutUnreadableReason: 'Tablero roto',
      }),
    );

    expect(prismaMock.careEpisodeAttachment.count).toHaveBeenCalledWith({
      where: { careEpisodeId, phase: 'after', removedAt: null },
    });
    expect(prismaMock.careEpisode.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          mileageOut: null,
          mileageOutUnreadable: true,
          mileageOutUnreadableReason: 'Tablero roto',
        }),
      }),
    );
    expect(result.data.mileageOutUnreadable).toBe(true);
  });

  it('rechaza 400 "no legible" sin foto after', async () => {
    await expect(
      handler.execute(
        makeCommand({
          mileageOut: undefined,
          mileageOutUnreadable: true,
          mileageOutUnreadableReason: 'Tablero roto',
        }),
      ),
    ).rejects.toThrow('Adjuntá la foto del tablero antes de cerrar');
    expect(prismaMock.careEpisode.update).not.toHaveBeenCalled();
    expect(eventEmitterMock.emit).not.toHaveBeenCalled();
  });

  it('rechaza 400 si no viene odómetro ni excepción', async () => {
    await expect(
      handler.execute(makeCommand({ mileageOut: undefined })),
    ).rejects.toThrow(BadRequestException);
  });

  it('rechaza 400 si vienen odómetro y excepción juntos', async () => {
    await expect(
      handler.execute(
        makeCommand({
          mileageOutUnreadable: true,
          mileageOutUnreadableReason: 'Tablero roto',
        }),
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('rechaza 400 si "no legible" no trae motivo', async () => {
    await expect(
      handler.execute(
        makeCommand({ mileageOut: undefined, mileageOutUnreadable: true }),
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('rechaza 400 si el motivo viene sin marcar "no legible"', async () => {
    await expect(
      handler.execute(makeCommand({ mileageOutUnreadableReason: 'Roto' })),
    ).rejects.toThrow(BadRequestException);
  });

  it('rechaza 400 si el egreso es menor al ingreso del mismo episodio', async () => {
    await expect(
      handler.execute(makeCommand({ mileageOut: 44000 })),
    ).rejects.toThrow('El odómetro de egreso no puede ser menor al de ingreso');
  });

  it('no bloquea si el egreso es menor al máximo histórico: marca mileageOutlier', async () => {
    prismaMock.careEpisode.aggregate.mockResolvedValue({
      _max: { mileageIn: 45000, mileageOut: 50000 },
    });

    const result = await handler.execute(makeCommand({ mileageOut: 45500 }));

    expect(result.data.mileageOutlier).toBe(true);
    expect(result.data.status).toBe('delivered');
  });

  it('considera VehicleMileage en el máximo histórico', async () => {
    prismaMock.vehicleMileage.aggregate.mockResolvedValue({
      _max: { mileage: 60000 },
    });

    const result = await handler.execute(makeCommand({ mileageOut: 45500 }));

    expect(result.data.mileageOutlier).toBe(true);
    expect(prismaMock.vehicleMileage.aggregate).toHaveBeenCalledWith({
      where: { vehicleId },
      _max: { mileage: true },
    });
  });

  // ──────────────────────────────────────────────────────
  // Estados
  // ──────────────────────────────────────────────────────

  it('rechaza 404 cuando el episodio no es del taller', async () => {
    prismaMock.careEpisode.findFirst.mockResolvedValue(null);

    await expect(handler.execute(makeCommand())).rejects.toThrow(
      NotFoundException,
    );
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('rechaza 409 si la atención ya está cerrada (pre-check)', async () => {
    prismaMock.careEpisode.findFirst.mockResolvedValue({
      id: careEpisodeId,
      vehicleId,
      status: 'delivered',
      mileageIn: 45000,
    });

    await expect(handler.execute(makeCommand())).rejects.toThrow(
      ConflictException,
    );
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('rechaza 409 si el estado cambió entre el pre-check y el lock', async () => {
    prismaMock.$queryRaw.mockResolvedValue([
      {
        status: 'delivered',
        workshop_id: workshopId,
        vehicle_id: vehicleId,
        mileage_in: 45000,
      },
    ]);

    await expect(handler.execute(makeCommand())).rejects.toThrow(
      'La atención ya fue cerrada',
    );
    expect(prismaMock.careEpisode.update).not.toHaveBeenCalled();
    expect(eventEmitterMock.emit).not.toHaveBeenCalled();
  });

  it('rechaza 404 si el lock no encuentra el episodio', async () => {
    prismaMock.$queryRaw.mockResolvedValue([]);

    await expect(handler.execute(makeCommand())).rejects.toThrow(
      NotFoundException,
    );
  });

  // ──────────────────────────────────────────────────────
  // Tipos de atención
  // ──────────────────────────────────────────────────────

  it('rechaza 400 si el episodio no tiene tipos y no se envía ninguno', async () => {
    await expect(
      handler.execute(makeCommand({ serviceTypeIds: undefined })),
    ).rejects.toThrow('Agregá al menos un tipo de atención');
  });

  it('rechaza 400 si el total final supera 3 tipos', async () => {
    prismaMock.careEpisodeServiceType.findMany.mockResolvedValue([
      { serviceTypeId: 'st-1', customLabel: null },
      { serviceTypeId: 'st-2', customLabel: null },
      { serviceTypeId: 'st-3', customLabel: null },
    ]);
    prismaMock.serviceType.findMany.mockResolvedValue([{ id: 'st-4' }]);

    await expect(
      handler.execute(makeCommand({ serviceTypeIds: ['st-1', 'st-4'] })),
    ).rejects.toThrow(BadRequestException);
  });

  it('rechaza 400 si un tipo del catálogo no existe o está inactivo', async () => {
    prismaMock.serviceType.findMany.mockResolvedValue([]);

    await expect(handler.execute(makeCommand())).rejects.toThrow(
      'Uno o más tipos de atención no existen o están inactivos',
    );
  });

  // ──────────────────────────────────────────────────────
  // Evento post-commit
  // ──────────────────────────────────────────────────────

  it('si falla el update, no emite el evento', async () => {
    prismaMock.careEpisode.update.mockRejectedValue(new Error('db down'));

    await expect(handler.execute(makeCommand())).rejects.toThrow('db down');
    expect(eventEmitterMock.emit).not.toHaveBeenCalled();
  });
});
