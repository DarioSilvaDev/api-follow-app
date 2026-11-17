// uuid@14 es ESM-only; se mockea antes de importar (el handler genera el
// episodeId y transita StorageR2Service) — patrón de POST /owner (S6).
jest.mock('uuid', () => ({ v4: () => 'test-episode-uuid' }));

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import { StorageR2Service } from '../../../../common/storage/storage-r2.service';
import { NotFoundException } from '../../../../common/exceptions/not-found.exception';
import { CheckInDto } from '../../dto/check-in.dto';
import { CheckInCommand } from './check-in.command';
import { CheckInHandler } from './check-in.handler';

describe('CheckInHandler — B-2 check-in unificado', () => {
  let handler: CheckInHandler;
  let storageMock: { upload: jest.Mock; delete: jest.Mock };
  let prismaMock: {
    workshopBranch: { findUnique: jest.Mock };
    serviceType: { findMany: jest.Mock };
    vehicleBrand: { findUnique: jest.Mock };
    vehicleModel: { findUnique: jest.Mock };
    vehicleVersion: { findUnique: jest.Mock };
    vehicle: { findUnique: jest.Mock; create: jest.Mock };
    careEpisode: { create: jest.Mock };
    vehicleOwnerContact: {
      updateMany: jest.Mock;
      create: jest.Mock;
      findFirst: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let eventEmitterMock: { emit: jest.Mock };

  const workshopId = 'w1';
  const memberId = 'member-1';
  const userId = 'user-1';
  const branchId = 'branch-1';
  const episodeId = 'test-episode-uuid';
  const attachmentKey = `care-episodes/${episodeId}/foto.webp`;
  const checkedInAt = new Date('2026-11-03T10:00:00.000Z');

  const makeFile = (
    overrides: Partial<Express.Multer.File> = {},
  ): Express.Multer.File =>
    ({
      fieldname: 'files',
      originalname: 'odometro.jpg',
      encoding: '7bit',
      mimetype: 'image/jpeg',
      size: 1234,
      buffer: Buffer.from('evidence'),
      ...overrides,
    }) as Express.Multer.File;

  const p2002 = (target: string[]) =>
    new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: '6.19.3',
      meta: { target },
    });

  function makeDto(overrides: Partial<CheckInDto> = {}): CheckInDto {
    return {
      licensePlate: 'ABC123',
      branchId,
      mileageIn: 45000,
      ...overrides,
    };
  }

  function makeCommand(
    overrides: Partial<CheckInDto> = {},
    files?: Express.Multer.File[],
  ) {
    return new CheckInCommand(
      makeDto(overrides),
      workshopId,
      memberId,
      userId,
      files,
    );
  }

  beforeEach(() => {
    prismaMock = {
      workshopBranch: { findUnique: jest.fn() },
      serviceType: { findMany: jest.fn() },
      vehicleBrand: { findUnique: jest.fn() },
      vehicleModel: { findUnique: jest.fn() },
      vehicleVersion: { findUnique: jest.fn() },
      vehicle: { findUnique: jest.fn(), create: jest.fn() },
      careEpisode: { create: jest.fn() },
      vehicleOwnerContact: {
        updateMany: jest.fn(),
        create: jest.fn(),
        findFirst: jest.fn(),
      },
      $transaction: jest.fn(async (cb: (tx: unknown) => unknown) =>
        cb(prismaMock),
      ),
    };
    eventEmitterMock = { emit: jest.fn() };
    storageMock = {
      upload: jest
        .fn()
        .mockResolvedValue({ key: attachmentKey, url: attachmentKey }),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    handler = new CheckInHandler(
      prismaMock as any,
      eventEmitterMock as unknown as EventEmitter2,
      storageMock as unknown as StorageR2Service,
    );

    // Defaults del happy path (cada test los ajusta si hace falta).
    prismaMock.workshopBranch.findUnique.mockResolvedValue({
      id: branchId,
      workshopId,
      workshop: { name: 'Taller Uno' },
    });
    prismaMock.serviceType.findMany.mockResolvedValue([]);
    prismaMock.vehicle.findUnique.mockResolvedValue(null);
    prismaMock.vehicle.create.mockResolvedValue({
      id: 'v1',
      vin: null,
      deletedAt: null,
    });
    prismaMock.careEpisode.create.mockResolvedValue({
      id: 'ce1',
      status: 'open',
      mileageIn: 45000,
      checkedInAt,
      vehicleId: 'v1',
      attachments: [],
    });
    prismaMock.vehicleOwnerContact.findFirst.mockResolvedValue(null);
    prismaMock.vehicleOwnerContact.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.vehicleOwnerContact.create.mockResolvedValue({ id: 'c1' });
  });

  // ──────────────────────────────────────────────────────
  // Happy paths
  // ──────────────────────────────────────────────────────

  it('crea vehículo + atención abierta + contacto unavailable y emite ambos eventos', async () => {
    const result = await handler.execute(makeCommand());

    expect(result).toEqual({
      data: {
        careEpisodeId: 'ce1',
        vehicleId: 'v1',
        licensePlate: 'ABC123',
        status: 'open',
        mileageIn: 45000,
        checkedInAt,
        vehicleCreated: true,
        ownerContact: { status: 'unavailable', phoneMasked: null },
        attachments: [],
        attachmentCount: 0,
      },
    });

    expect(prismaMock.vehicle.create).toHaveBeenCalledWith({
      data: {
        licensePlate: 'ABC123',
        vin: null,
        versionId: null,
        brandName: null,
        modelName: null,
      },
      select: { id: true, vin: true, deletedAt: true },
    });
    expect(prismaMock.careEpisode.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          vehicleId: 'v1',
          workshopId,
          branchId,
          createdByMemberId: memberId,
          status: 'open',
          source: 'workshop',
          mileageIn: 45000,
          mileageInUnreadable: false,
          workshopName: 'Taller Uno',
        }),
      }),
    );
    expect(prismaMock.vehicleOwnerContact.create).toHaveBeenCalledWith({
      data: {
        vehicleId: 'v1',
        status: 'unavailable',
        source: 'workshop_counter',
        recordedByMemberId: memberId,
      },
    });

    expect(eventEmitterMock.emit).toHaveBeenCalledTimes(2);
    expect(eventEmitterMock.emit).toHaveBeenCalledWith(
      'vehicle.registered',
      expect.objectContaining({
        vehicleId: 'v1',
        ownerId: userId,
        licensePlate: 'ABC123',
      }),
    );
    expect(eventEmitterMock.emit).toHaveBeenCalledWith(
      'care-episode.created',
      expect.objectContaining({
        careEpisodeId: 'ce1',
        vehicleId: 'v1',
        source: 'workshop',
        workshopId,
        createdByMemberId: memberId,
      }),
    );
  });

  it('reutiliza un vehículo existente y NO emite vehicle.registered', async () => {
    prismaMock.vehicle.findUnique.mockResolvedValue({
      id: 'v-existing',
      vin: '1HGCM82633A123456',
      deletedAt: null,
    });

    const result = await handler.execute(
      makeCommand({ vin: '1HGCM82633A123456' }),
    );

    expect(result.data.vehicleCreated).toBe(false);
    expect(prismaMock.vehicle.create).not.toHaveBeenCalled();
    expect(eventEmitterMock.emit).toHaveBeenCalledTimes(1);
    expect(eventEmitterMock.emit).toHaveBeenCalledWith(
      'care-episode.created',
      expect.anything(),
    );
  });

  it('normaliza placa y VIN (trim + uppercase)', async () => {
    await handler.execute(
      makeCommand({ licensePlate: '  abc123  ', vin: ' 1hgcm82633a123456 ' }),
    );

    expect(prismaMock.vehicle.findUnique).toHaveBeenCalledWith({
      where: { licensePlate: 'ABC123' },
      select: { id: true, vin: true, deletedAt: true },
    });
    expect(prismaMock.vehicle.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          licensePlate: 'ABC123',
          vin: '1HGCM82633A123456',
        }),
      }),
    );
  });

  it('registra odómetro "no legible" con motivo y foto del tablero', async () => {
    const file = makeFile();
    const createdAt = new Date('2026-11-03T10:00:00.000Z');
    prismaMock.careEpisode.create.mockResolvedValue({
      id: episodeId,
      status: 'open',
      mileageIn: null,
      checkedInAt,
      vehicleId: 'v1',
      attachments: [
        {
          id: 'att-1',
          key: attachmentKey,
          originalName: 'odometro.jpg',
          mimeType: 'image/jpeg',
          sizeBytes: 1234,
          caption: null,
          phase: 'before',
          uploadedByMemberId: memberId,
          uploadedByUserId: null,
          removedAt: null,
          createdAt,
        },
      ],
    });

    const result = await handler.execute(
      makeCommand(
        {
          mileageIn: undefined,
          mileageInUnreadable: true,
          mileageInUnreadableReason: 'Tablero roto',
        },
        [file],
      ),
    );

    expect(storageMock.upload).toHaveBeenCalledWith(
      file,
      `care-episodes/${episodeId}`,
    );
    expect(prismaMock.careEpisode.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          id: episodeId,
          mileageIn: null,
          mileageInUnreadable: true,
          mileageInUnreadableReason: 'Tablero roto',
          attachments: {
            create: [
              expect.objectContaining({
                key: attachmentKey,
                phase: 'before',
                uploadedByMemberId: memberId,
                uploadedByUserId: null,
              }),
            ],
          },
        }),
        select: expect.objectContaining({ attachments: true }),
      }),
    );
    expect(result.data.attachmentCount).toBe(1);
    expect(result.data.attachments[0]).toEqual(
      expect.objectContaining({
        id: 'att-1',
        phase: 'before',
        removed: false,
      }),
    );
    // Persistió el episodio: la compensación no borra el blob.
    expect(storageMock.delete).not.toHaveBeenCalled();
  });

  it('persiste tipos de atención del catálogo + texto libre "Otro"', async () => {
    prismaMock.serviceType.findMany.mockResolvedValue([
      { id: 'st-1' },
      { id: 'st-2' },
    ]);

    await handler.execute(
      makeCommand({
        serviceTypeIds: ['st-1', 'st-2'],
        customServiceLabel: '  Detailing  ',
      }),
    );

    expect(prismaMock.careEpisode.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          serviceTypes: {
            create: [
              { serviceTypeId: 'st-1', customLabel: null },
              { serviceTypeId: 'st-2', customLabel: null },
              { serviceTypeId: null, customLabel: 'Detailing' },
            ],
          },
        }),
      }),
    );
  });

  it('resuelve marca/modelo desde el catálogo por brandId/modelId', async () => {
    prismaMock.vehicleBrand.findUnique.mockResolvedValue({ name: 'Toyota' });
    prismaMock.vehicleModel.findUnique.mockResolvedValue({
      name: 'Corolla',
      brandId: 'brand-1',
      brand: { name: 'Toyota' },
    });

    await handler.execute(
      makeCommand({ brandId: 'brand-1', modelId: 'model-1' }),
    );

    expect(prismaMock.vehicle.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          brandName: 'Toyota',
          modelName: 'Corolla',
        }),
      }),
    );
  });

  it('resuelve marca/modelo desde la versión cuando viene versionId', async () => {
    prismaMock.vehicleVersion.findUnique.mockResolvedValue({
      id: 'ver-1',
      model: { name: 'Hilux', brand: { name: 'Toyota' } },
    });

    await handler.execute(makeCommand({ versionId: 'ver-1' }));

    expect(prismaMock.vehicle.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          versionId: 'ver-1',
          brandName: 'Toyota',
          modelName: 'Hilux',
        }),
      }),
    );
  });

  it('guarda el celular normalizado a E.164 y enmascarado en la respuesta', async () => {
    const result = await handler.execute(
      makeCommand({
        ownerPhone: { areaCode: '336', nationalNumber: '4687486' },
      }),
    );

    expect(prismaMock.vehicleOwnerContact.updateMany).toHaveBeenCalledWith({
      where: { vehicleId: 'v1', isActive: true },
      data: { isActive: false },
    });
    expect(prismaMock.vehicleOwnerContact.create).toHaveBeenCalledWith({
      data: {
        vehicleId: 'v1',
        phoneE164: '+543364687486',
        phoneAreaCode: '336',
        phoneNationalNumber: '4687486',
        status: 'available',
        source: 'workshop_counter',
        recordedByMemberId: memberId,
      },
    });
    expect(result.data.ownerContact).toEqual({
      status: 'available',
      phoneMasked: '…7486',
    });
  });

  it('conserva el contacto activo existente cuando no se envía celular', async () => {
    prismaMock.vehicleOwnerContact.findFirst.mockResolvedValue({
      status: 'available',
      phoneE164: '+541122681000',
    });

    const result = await handler.execute(makeCommand());

    expect(prismaMock.vehicleOwnerContact.create).not.toHaveBeenCalled();
    expect(result.data.ownerContact).toEqual({
      status: 'available',
      phoneMasked: '…1000',
    });
  });

  // ──────────────────────────────────────────────────────
  // Validación
  // ──────────────────────────────────────────────────────

  it('rechaza 404 cuando la sucursal no existe', async () => {
    prismaMock.workshopBranch.findUnique.mockResolvedValue(null);

    await expect(handler.execute(makeCommand())).rejects.toThrow(
      NotFoundException,
    );
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('rechaza 403 cuando la sucursal es de otro taller', async () => {
    prismaMock.workshopBranch.findUnique.mockResolvedValue({
      id: branchId,
      workshopId: 'other',
      workshop: { name: 'Otro' },
    });

    await expect(handler.execute(makeCommand())).rejects.toThrow(
      ForbiddenException,
    );
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('rechaza 400 si no viene odómetro ni excepción', async () => {
    await expect(
      handler.execute(makeCommand({ mileageIn: undefined })),
    ).rejects.toThrow(BadRequestException);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('rechaza 400 si vienen odómetro y excepción juntos', async () => {
    await expect(
      handler.execute(
        makeCommand({
          mileageInUnreadable: true,
          mileageInUnreadableReason: 'No se ve',
        }),
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('rechaza 400 si "no legible" no trae motivo', async () => {
    await expect(
      handler.execute(
        makeCommand({ mileageIn: undefined, mileageInUnreadable: true }),
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('rechaza 400 si el motivo viene sin marcar "no legible"', async () => {
    await expect(
      handler.execute(makeCommand({ mileageInUnreadableReason: 'No se ve' })),
    ).rejects.toThrow(BadRequestException);
  });

  it('rechaza 400 si el odómetro es ilegible y no viene la foto (D-163)', async () => {
    await expect(
      handler.execute(
        makeCommand({
          mileageIn: undefined,
          mileageInUnreadable: true,
          mileageInUnreadableReason: 'Tablero roto',
        }),
      ),
    ).rejects.toThrow(BadRequestException);

    expect(storageMock.upload).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('rechaza 400 si llega más de una foto', async () => {
    await expect(
      handler.execute(
        makeCommand({}, [makeFile(), makeFile({ originalname: 'otra.jpg' })]),
      ),
    ).rejects.toThrow(/Máximo 1 foto/);
    expect(storageMock.upload).not.toHaveBeenCalled();
  });

  it('acepta 1 foto opcional cuando el odómetro sí se lee (D-170)', async () => {
    const file = makeFile();

    await handler.execute(makeCommand({}, [file]));

    expect(storageMock.upload).toHaveBeenCalledWith(
      file,
      `care-episodes/${episodeId}`,
    );
    expect(prismaMock.careEpisode.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          attachments: {
            create: [
              expect.objectContaining({
                key: attachmentKey,
                phase: 'before',
              }),
            ],
          },
        }),
      }),
    );
  });

  it('responde 503 (no 400) si el storage falla y no persiste nada', async () => {
    storageMock.upload.mockRejectedValue(new Error('s3 down'));

    await expect(
      handler.execute(makeCommand({}, [makeFile()])),
    ).rejects.toThrow(ServiceUnavailableException);

    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(eventEmitterMock.emit).not.toHaveBeenCalled();
  });

  it('compensa el blob si la persistencia falla después del upload', async () => {
    prismaMock.careEpisode.create.mockRejectedValue(
      new Error('db unavailable'),
    );

    await expect(
      handler.execute(makeCommand({}, [makeFile()])),
    ).rejects.toThrow('db unavailable');

    expect(storageMock.delete).toHaveBeenCalledWith(attachmentKey);
    expect(eventEmitterMock.emit).not.toHaveBeenCalled();
  });

  it('rechaza 400 si más de 3 tipos de atención en total', async () => {
    await expect(
      handler.execute(
        makeCommand({
          serviceTypeIds: ['st-1', 'st-2', 'st-3'],
          customServiceLabel: 'Otro',
        }),
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('rechaza 400 si un tipo del catálogo no existe o está inactivo', async () => {
    prismaMock.serviceType.findMany.mockResolvedValue([{ id: 'st-1' }]);

    await expect(
      handler.execute(makeCommand({ serviceTypeIds: ['st-1', 'st-2'] })),
    ).rejects.toThrow(BadRequestException);
  });

  it('rechaza 400 si brandId y brandName vienen juntos', async () => {
    await expect(
      handler.execute(makeCommand({ brandId: 'brand-1', brandName: 'Toyota' })),
    ).rejects.toThrow(BadRequestException);
  });

  it('rechaza 400 si versionId viene con marca/modelo', async () => {
    await expect(
      handler.execute(makeCommand({ versionId: 'ver-1', brandName: 'Toyota' })),
    ).rejects.toThrow(BadRequestException);
  });

  it('rechaza 400 si el celular está incompleto', async () => {
    await expect(
      handler.execute(makeCommand({ ownerPhone: { areaCode: '336' } })),
    ).rejects.toThrow(BadRequestException);
  });

  // ──────────────────────────────────────────────────────
  // Conflictos
  // ──────────────────────────────────────────────────────

  it('rechaza 409 si el vehículo está dado de baja (no lo resucita)', async () => {
    prismaMock.vehicle.findUnique.mockResolvedValue({
      id: 'v-deleted',
      vin: null,
      deletedAt: new Date(),
    });

    await expect(handler.execute(makeCommand())).rejects.toThrow(
      ConflictException,
    );
    expect(prismaMock.vehicle.create).not.toHaveBeenCalled();
    expect(prismaMock.careEpisode.create).not.toHaveBeenCalled();
    expect(eventEmitterMock.emit).not.toHaveBeenCalled();
  });

  it('rechaza 409 si el VIN no coincide con el vehículo registrado', async () => {
    prismaMock.vehicle.findUnique.mockResolvedValue({
      id: 'v1',
      vin: '1HGCM82633A123456',
      deletedAt: null,
    });

    await expect(
      handler.execute(makeCommand({ vin: '5YJ3E1EA7HF123456' })),
    ).rejects.toThrow(ConflictException);
    expect(prismaMock.careEpisode.create).not.toHaveBeenCalled();
  });

  it('rechaza 409 si el VIN ya pertenece a otro vehículo (P2002)', async () => {
    prismaMock.vehicle.create.mockRejectedValue(p2002(['vin']));

    await expect(
      handler.execute(makeCommand({ vin: '1HGCM82633A123456' })),
    ).rejects.toThrow('VIN ya registrado en otro vehículo');
    expect(eventEmitterMock.emit).not.toHaveBeenCalled();
  });

  it('ante la carrera de placa (P2002) re-lee el vehículo y crea sólo la atención', async () => {
    prismaMock.vehicle.findUnique
      // 1) findUnique dentro de la primera transacción
      .mockResolvedValueOnce(null)
      // 2) re-lectura post-P2002 fuera de la transacción
      .mockResolvedValueOnce({ id: 'v-race' })
      // 3) findUnique por id dentro de la segunda transacción
      .mockResolvedValueOnce({
        id: 'v-race',
        vin: null,
        deletedAt: null,
      });
    prismaMock.vehicle.create.mockRejectedValue(p2002(['license_plate']));
    prismaMock.careEpisode.create.mockResolvedValue({
      id: 'ce-race',
      status: 'open',
      mileageIn: 45000,
      checkedInAt,
      vehicleId: 'v-race',
      attachments: [],
    });

    const result = await handler.execute(makeCommand());

    expect(result.data.vehicleId).toBe('v-race');
    expect(result.data.vehicleCreated).toBe(false);
    expect(prismaMock.vehicle.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.careEpisode.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(2);
    // El reintento no emite vehicle.registered (el vehículo ya existía).
    expect(eventEmitterMock.emit).toHaveBeenCalledTimes(1);
    expect(eventEmitterMock.emit).toHaveBeenCalledWith(
      'care-episode.created',
      expect.anything(),
    );
  });

  // ──────────────────────────────────────────────────────
  // Atomicidad / eventos
  // ──────────────────────────────────────────────────────

  it('si falla la creación de la atención, la transacción se rechaza y no emite eventos', async () => {
    prismaMock.careEpisode.create.mockRejectedValue(
      new Error('db unavailable'),
    );

    await expect(handler.execute(makeCommand())).rejects.toThrow(
      'db unavailable',
    );
    expect(eventEmitterMock.emit).not.toHaveBeenCalled();
  });
});
