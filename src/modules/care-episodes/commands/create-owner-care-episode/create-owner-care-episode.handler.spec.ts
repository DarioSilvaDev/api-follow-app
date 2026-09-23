// uuid@14 es ESM-only; se mockea antes de importar (el handler transita
// StorageR2Service y genera episodeId) — patrón consistente con
// attach-care-episode-attachments.handler.spec.ts.
jest.mock('uuid', () => ({ v4: () => 'test-episode-uuid' }));

import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { NotFoundException } from '../../../../common/exceptions/not-found.exception';
import { VehicleAccessService } from '../../../../common/authorization/vehicle-access.service';
import { CreateOwnerCareEpisodeHandler } from './create-owner-care-episode.handler';
import { CreateOwnerCareEpisodeCommand } from './create-owner-care-episode.command';
import { CreateOwnerCareEpisodeDto } from '../../dto/create-owner-care-episode.dto';

describe('CreateOwnerCareEpisodeHandler — RF-1 owner records a service', () => {
  let handler: CreateOwnerCareEpisodeHandler;
  let prismaMock: {
    vehicle: { findUnique: jest.Mock };
    workshop: { findFirst: jest.Mock };
    careEpisode: { create: jest.Mock };
  };
  let accessMock: { assertOwnership: jest.Mock };
  let eventEmitterMock: { emit: jest.Mock };
  let storageMock: { upload: jest.Mock; delete: jest.Mock };

  const vehicleId = 'v-1';
  const userId = 'user-1';
  const workshopId = 'w-1';
  const episodeId = 'test-episode-uuid';

  const personalCtx = { type: 'PERSONAL' } as const;
  const workshopCtx = {
    type: 'WORKSHOP',
    workshopId,
    memberId: 'm-1',
  } as const;

  function makeDto(overrides: Partial<CreateOwnerCareEpisodeDto> = {}) {
    // Sin workshopName por defecto: el XOR se prueba explícitamente en cada caso.
    const dto: CreateOwnerCareEpisodeDto = {
      vehicleId,
      title: 'Cambio de aceite',
      serviceDate: '2026-09-10T10:00:00.000Z',
      ...overrides,
    };
    return dto;
  }

  function makeCommand(
    overrides: Partial<CreateOwnerCareEpisodeDto> = {},
    ctx: typeof personalCtx | typeof workshopCtx = personalCtx,
    files?: Express.Multer.File[],
  ) {
    return new CreateOwnerCareEpisodeCommand(
      makeDto(overrides),
      {
        id: userId,
        email: 'owner@example.com',
        role: 'user',
      } as never,
      files,
    );
  }

  function makeFile(
    originalname = 'evidencia.jpg',
    mimetype = 'image/jpeg',
  ): Express.Multer.File {
    return {
      fieldname: 'files',
      originalname,
      encoding: '7bit',
      mimetype,
      buffer: Buffer.from('data'),
      size: 2048,
      stream: null as any,
      destination: '',
      filename: '',
      path: '',
    };
  }

  function makeEpisode(overrides: Record<string, unknown> = {}) {
    return {
      id: 'ce-1',
      vehicleId,
      source: 'owner',
      status: 'delivered',
      verification: 'unverified',
      workshopId: null,
      workshopName: 'Taller Don Pepe',
      createdByUserId: userId,
      attachments: [],
      ...overrides,
    };
  }

  function makeAttachment(
    key: string,
    overrides: Record<string, unknown> = {},
  ) {
    return {
      id: `att-${key}`,
      careEpisodeId: episodeId,
      key,
      originalName: 'evidencia.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 2048,
      caption: null,
      phase: null,
      uploadedByUserId: userId,
      uploadedByMemberId: null,
      createdAt: new Date('2026-09-10T12:00:00.000Z'),
      removedAt: null,
      ...overrides,
    };
  }

  beforeEach(() => {
    prismaMock = {
      vehicle: { findUnique: jest.fn() },
      workshop: { findFirst: jest.fn() },
      careEpisode: { create: jest.fn() },
    };
    accessMock = { assertOwnership: jest.fn() };
    eventEmitterMock = { emit: jest.fn() };
    storageMock = { upload: jest.fn(), delete: jest.fn() };
    handler = new CreateOwnerCareEpisodeHandler(
      prismaMock as any,
      accessMock as unknown as VehicleAccessService,
      eventEmitterMock as unknown as EventEmitter2,
      storageMock as any,
    );
  });

  // ──────────────────────────────────────────────────────
  // Context
  // ──────────────────────────────────────────────────────

  it('rejects 403 when the context is NOT PERSONAL', async () => {
    await expect(
      handler.execute(makeCommand({}, workshopCtx), workshopCtx),
    ).rejects.toThrow(ForbiddenException);
    expect(prismaMock.careEpisode.create).not.toHaveBeenCalled();
    expect(eventEmitterMock.emit).not.toHaveBeenCalled();
  });

  // ──────────────────────────────────────────────────────
  // serviceDate
  // ──────────────────────────────────────────────────────

  it('rejects 400 when serviceDate is in the future', async () => {
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    await expect(
      handler.execute(makeCommand({ serviceDate: future }), personalCtx),
    ).rejects.toThrow(BadRequestException);
    expect(prismaMock.careEpisode.create).not.toHaveBeenCalled();
  });

  it('accepts a serviceDate set to the end of the current UTC day (same-day boundary)', async () => {
    prismaMock.vehicle.findUnique.mockResolvedValue({ id: vehicleId });
    accessMock.assertOwnership.mockResolvedValue(undefined);
    prismaMock.careEpisode.create.mockResolvedValue(
      makeEpisode({ id: 'ce-1' }),
    );

    const endOfUtcDay = new Date();
    endOfUtcDay.setUTCHours(23, 59, 59, 999);
    await handler.execute(
      makeCommand({
        serviceDate: endOfUtcDay.toISOString(),
        workshopName: 'Taller Don Pepe',
      }),
      personalCtx,
    );

    expect(prismaMock.careEpisode.create).toHaveBeenCalled();
    expect(eventEmitterMock.emit).toHaveBeenCalledTimes(1);
  });

  // ──────────────────────────────────────────────────────
  // XOR taller responsable
  // ──────────────────────────────────────────────────────

  it('rejects 400 when both workshopId and workshopName are provided', async () => {
    await expect(
      handler.execute(
        makeCommand({ workshopId, workshopName: 'Taller X' }),
        personalCtx,
      ),
    ).rejects.toThrow(BadRequestException);
    expect(prismaMock.careEpisode.create).not.toHaveBeenCalled();
  });

  it('rejects 400 when neither workshopId nor workshopName is provided', async () => {
    await expect(
      handler.execute(
        makeCommand({ workshopId: undefined, workshopName: undefined }),
        personalCtx,
      ),
    ).rejects.toThrow(BadRequestException);
    expect(prismaMock.careEpisode.create).not.toHaveBeenCalled();
  });

  // ──────────────────────────────────────────────────────
  // Vehículo
  // ──────────────────────────────────────────────────────

  it('rejects 404 when the vehicle does not exist', async () => {
    prismaMock.vehicle.findUnique.mockResolvedValue(null);

    await expect(
      handler.execute(
        makeCommand({ workshopName: 'Taller Don Pepe' }),
        personalCtx,
      ),
    ).rejects.toThrow(NotFoundException);
    expect(accessMock.assertOwnership).not.toHaveBeenCalled();
    expect(prismaMock.careEpisode.create).not.toHaveBeenCalled();
    expect(eventEmitterMock.emit).not.toHaveBeenCalled();
  });

  it('rejects 403 when the user does not own the vehicle (assertOwnership)', async () => {
    prismaMock.vehicle.findUnique.mockResolvedValue({ id: vehicleId });
    accessMock.assertOwnership.mockRejectedValue(
      new ForbiddenException(
        'Only the vehicle owner can perform this operation',
      ),
    );

    await expect(
      handler.execute(
        makeCommand({ workshopName: 'Taller Don Pepe' }),
        personalCtx,
      ),
    ).rejects.toThrow(ForbiddenException);
    expect(prismaMock.careEpisode.create).not.toHaveBeenCalled();
    expect(eventEmitterMock.emit).not.toHaveBeenCalled();
  });

  // ──────────────────────────────────────────────────────
  // workshopId (taller de la app)
  // ──────────────────────────────────────────────────────

  it('rejects 404 when the app workshop does not exist or is inactive', async () => {
    prismaMock.vehicle.findUnique.mockResolvedValue({ id: vehicleId });
    accessMock.assertOwnership.mockResolvedValue(undefined);
    prismaMock.workshop.findFirst.mockResolvedValue(null);

    await expect(
      handler.execute(makeCommand({ workshopId }), personalCtx),
    ).rejects.toThrow(NotFoundException);
    expect(prismaMock.workshop.findFirst).toHaveBeenCalledWith({
      where: { id: workshopId, isActive: true },
      select: { id: true },
    });
    expect(prismaMock.careEpisode.create).not.toHaveBeenCalled();
  });

  // ──────────────────────────────────────────────────────
  // Happy paths
  // ──────────────────────────────────────────────────────

  it('creates an owner care episode with workshopId (delivered + unverified) and emits the event', async () => {
    prismaMock.vehicle.findUnique.mockResolvedValue({ id: vehicleId });
    accessMock.assertOwnership.mockResolvedValue(undefined);
    prismaMock.workshop.findFirst.mockResolvedValue({ id: workshopId });
    prismaMock.careEpisode.create.mockResolvedValue(
      makeEpisode({
        id: 'ce-1',
        source: 'owner',
        status: 'delivered',
        verification: 'unverified',
        workshopId,
        createdByUserId: userId,
      }),
    );

    const result = await handler.execute(
      makeCommand({
        workshopId,
        mileageIn: 45200,
        notes: 'Hace ruido al frenar',
      }),
      personalCtx,
    );

    expect(result).toEqual(expect.objectContaining({ id: 'ce-1' }));
    expect(prismaMock.careEpisode.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        vehicleId,
        source: 'owner',
        status: 'delivered',
        verification: 'unverified',
        title: 'Cambio de aceite',
        mileageIn: 45200,
        customerNotes: 'Hace ruido al frenar',
        workshopId,
        workshopName: null,
        createdByUserId: userId,
        checkedInAt: null,
        createdByMemberId: null,
        branchId: null,
      }),
      include: { attachments: true },
    });
    expect(eventEmitterMock.emit).toHaveBeenCalledTimes(1);
    expect(eventEmitterMock.emit).toHaveBeenCalledWith(
      'care-episode.created',
      expect.objectContaining({
        careEpisodeId: 'ce-1',
        vehicleId,
        source: 'owner',
        workshopId,
        createdByMemberId: null,
        createdByUserId: userId,
      }),
    );
  });

  it('creates an owner care episode with free-text workshopName', async () => {
    prismaMock.vehicle.findUnique.mockResolvedValue({ id: vehicleId });
    accessMock.assertOwnership.mockResolvedValue(undefined);
    prismaMock.careEpisode.create.mockResolvedValue(
      makeEpisode({ id: 'ce-2' }),
    );

    await handler.execute(
      makeCommand({ workshopName: 'Taller Don Pepe' }),
      personalCtx,
    );

    expect(prismaMock.workshop.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.careEpisode.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workshopId: null,
        workshopName: 'Taller Don Pepe',
      }),
      include: { attachments: true },
    });
    expect(eventEmitterMock.emit).toHaveBeenCalledWith(
      'care-episode.created',
      expect.objectContaining({
        source: 'owner',
        workshopId: null,
        createdByUserId: userId,
      }),
    );
  });

  it('persists notes as customerNotes and leaves workshop internal fields null', async () => {
    prismaMock.vehicle.findUnique.mockResolvedValue({ id: vehicleId });
    accessMock.assertOwnership.mockResolvedValue(undefined);
    prismaMock.careEpisode.create.mockResolvedValue(
      makeEpisode({ id: 'ce-3' }),
    );

    await handler.execute(
      makeCommand({ workshopName: 'Taller Don Pepe' }),
      personalCtx,
    );

    expect(prismaMock.careEpisode.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        serviceDate: expect.any(Date),
        customerNotes: null,
        branchId: null,
        title: 'Cambio de aceite',
      }),
      include: { attachments: true },
    });
  });

  it('does NOT emit the event when persistence fails', async () => {
    prismaMock.vehicle.findUnique.mockResolvedValue({ id: vehicleId });
    accessMock.assertOwnership.mockResolvedValue(undefined);
    prismaMock.careEpisode.create.mockRejectedValue(
      new Error('db unavailable'),
    );

    await expect(
      handler.execute(
        makeCommand({ workshopName: 'Taller Don Pepe' }),
        personalCtx,
      ),
    ).rejects.toThrow('db unavailable');
    expect(eventEmitterMock.emit).not.toHaveBeenCalled();
  });

  // ──────────────────────────────────────────────────────
  // S6 — ruta dual multipart: evidencia al crear
  // ──────────────────────────────────────────────────────

  describe('S6 — evidence at creation (multipart path)', () => {
    function mockStorageUploads(count: number) {
      for (let i = 0; i < count; i++) {
        storageMock.upload.mockResolvedValueOnce({
          key: `care-episodes/${episodeId}/file-${i}.webp`,
          url: `care-episodes/${episodeId}/file-${i}.webp`,
        });
      }
    }

    it('JSON path: no files → no storage uploads and NO attachments key in create data', async () => {
      prismaMock.vehicle.findUnique.mockResolvedValue({ id: vehicleId });
      accessMock.assertOwnership.mockResolvedValue(undefined);
      prismaMock.careEpisode.create.mockResolvedValue(
        makeEpisode({ id: 'ce-1' }),
      );

      await handler.execute(
        makeCommand({ workshopName: 'Taller Don Pepe' }),
        personalCtx,
      );

      expect(storageMock.upload).not.toHaveBeenCalled();
      expect(prismaMock.careEpisode.create).toHaveBeenCalledWith({
        data: expect.not.objectContaining({ attachments: expect.anything() }),
        include: { attachments: true },
      });
    });

    it('multipart success: uploads blobs under care-episodes/<episodeId> and creates episode with nested attachments (identity from context, phase null)', async () => {
      prismaMock.vehicle.findUnique.mockResolvedValue({ id: vehicleId });
      accessMock.assertOwnership.mockResolvedValue(undefined);
      mockStorageUploads(2);
      prismaMock.careEpisode.create.mockResolvedValue(
        makeEpisode({
          id: episodeId,
          attachments: [
            makeAttachment(`care-episodes/${episodeId}/file-0.webp`),
            makeAttachment(`care-episodes/${episodeId}/file-1.webp`),
          ],
        }),
      );

      const result = await handler.execute(
        makeCommand(
          { workshopName: 'Taller Don Pepe' },
          personalCtx,
          [makeFile('foto-a.jpg', 'image/jpeg'), makeFile('foto-b.png', 'image/png')],
        ),
        personalCtx,
      );

      // Uploads contra la carpeta del episodeId generado ANTES de subir.
      expect(storageMock.upload).toHaveBeenCalledTimes(2);
      expect(storageMock.upload).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ originalname: 'foto-a.jpg' }),
        `care-episodes/${episodeId}`,
      );
      expect(storageMock.upload).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ originalname: 'foto-b.png' }),
        `care-episodes/${episodeId}`,
      );

      // Create: id del episodio explícito + nested create de attachments.
      expect(prismaMock.careEpisode.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          id: episodeId,
          attachments: {
            create: [
              expect.objectContaining({
                key: `care-episodes/${episodeId}/file-0.webp`,
                originalName: 'foto-a.jpg',
                mimeType: 'image/jpeg',
                sizeBytes: 2048,
                phase: null,
                uploadedByUserId: userId,
                uploadedByMemberId: null,
              }),
              expect.objectContaining({
                key: `care-episodes/${episodeId}/file-1.webp`,
                originalName: 'foto-b.png',
                mimeType: 'image/png',
                phase: null,
                uploadedByUserId: userId,
                uploadedByMemberId: null,
              }),
            ],
          },
        }),
        include: { attachments: true },
      });

      // Response aditivo: attachments en la forma del detalle (removed: false).
      expect(result).toMatchObject({
        id: episodeId,
        attachments: [
          {
            key: `care-episodes/${episodeId}/file-0.webp`,
            uploadedByUserId: userId,
            uploadedByMemberId: null,
            phase: null,
            removed: false,
          },
          {
            key: `care-episodes/${episodeId}/file-1.webp`,
            uploadedByUserId: userId,
            uploadedByMemberId: null,
            phase: null,
            removed: false,
          },
        ],
        attachmentCount: 2,
      });

      // ÚNICO evento: care-episode.created (E-5, sin attachment.added).
      expect(eventEmitterMock.emit).toHaveBeenCalledTimes(1);
      expect(eventEmitterMock.emit).toHaveBeenCalledWith(
        'care-episode.created',
        expect.objectContaining({
          careEpisodeId: episodeId,
          vehicleId,
          source: 'owner',
          workshopId: null,
          createdByUserId: userId,
        }),
      );
      expect(eventEmitterMock.emit).not.toHaveBeenCalledWith(
        'care-episode.attachment.added',
        expect.anything(),
      );
      // No hay compensación en el happy path.
      expect(storageMock.delete).not.toHaveBeenCalled();
    });

    it('multipart success with 5 files (techo del diseño)', async () => {
      prismaMock.vehicle.findUnique.mockResolvedValue({ id: vehicleId });
      accessMock.assertOwnership.mockResolvedValue(undefined);
      mockStorageUploads(5);
      const createdAttachments = Array.from({ length: 5 }, (_, i) =>
        makeAttachment(`care-episodes/${episodeId}/file-${i}.webp`),
      );
      prismaMock.careEpisode.create.mockResolvedValue(
        makeEpisode({ id: episodeId, attachments: createdAttachments }),
      );

      const files = Array.from({ length: 5 }, (_, i) =>
        makeFile(`foto-${i}.jpg`),
      );

      await handler.execute(
        makeCommand({ workshopName: 'Taller Don Pepe' }, personalCtx, files),
        personalCtx,
      );

      expect(storageMock.upload).toHaveBeenCalledTimes(5);
      expect(prismaMock.careEpisode.create).toHaveBeenCalled();
      expect(eventEmitterMock.emit).toHaveBeenCalledTimes(1);
    });

    it('rejects 400 when more than 5 files reach the handler (defense in depth; multer ya limita en el interceptor)', async () => {
      prismaMock.vehicle.findUnique.mockResolvedValue({ id: vehicleId });
      accessMock.assertOwnership.mockResolvedValue(undefined);

      const files = Array.from({ length: 6 }, () => makeFile());

      await expect(
        handler.execute(
          makeCommand({ workshopName: 'Taller Don Pepe' }, personalCtx, files),
          personalCtx,
        ),
      ).rejects.toThrow(BadRequestException);

      expect(storageMock.upload).not.toHaveBeenCalled();
      expect(prismaMock.careEpisode.create).not.toHaveBeenCalled();
      expect(eventEmitterMock.emit).not.toHaveBeenCalled();
    });

    it('applies captions index-matched (sobrantes → null)', async () => {
      prismaMock.vehicle.findUnique.mockResolvedValue({ id: vehicleId });
      accessMock.assertOwnership.mockResolvedValue(undefined);
      mockStorageUploads(3);
      prismaMock.careEpisode.create.mockResolvedValue(
        makeEpisode({ id: episodeId, attachments: [] }),
      );

      await handler.execute(
        makeCommand(
          {
            workshopName: 'Taller Don Pepe',
            captions: ['Antes del cambio'],
          },
          personalCtx,
          [makeFile('a.jpg'), makeFile('b.jpg'), makeFile('c.jpg')],
        ),
        personalCtx,
      );

      const createData = prismaMock.careEpisode.create.mock.calls[0][0].data;
      expect(createData.attachments.create).toHaveLength(3);
      expect(createData.attachments.create[0].caption).toBe('Antes del cambio');
      expect(createData.attachments.create[1].caption).toBeNull();
      expect(createData.attachments.create[2].caption).toBeNull();
    });

    it('still 403 for non-owner with files: no uploads, no create, no event', async () => {
      prismaMock.vehicle.findUnique.mockResolvedValue({ id: vehicleId });
      accessMock.assertOwnership.mockRejectedValue(
        new ForbiddenException(
          'Only the vehicle owner can perform this operation',
        ),
      );

      await expect(
        handler.execute(
          makeCommand(
            { workshopName: 'Taller Don Pepe' },
            personalCtx,
            [makeFile()],
          ),
          personalCtx,
        ),
      ).rejects.toThrow(ForbiddenException);

      expect(storageMock.upload).not.toHaveBeenCalled();
      expect(prismaMock.careEpisode.create).not.toHaveBeenCalled();
      expect(eventEmitterMock.emit).not.toHaveBeenCalled();
    });

    it('compensation: DB failure after upload → storage.delete for EVERY uploaded blob + original error + NO event', async () => {
      prismaMock.vehicle.findUnique.mockResolvedValue({ id: vehicleId });
      accessMock.assertOwnership.mockResolvedValue(undefined);
      mockStorageUploads(2);
      prismaMock.careEpisode.create.mockRejectedValue(
        new Error('db exploded'),
      );

      await expect(
        handler.execute(
          makeCommand(
            { workshopName: 'Taller Don Pepe' },
            personalCtx,
            [makeFile('a.jpg'), makeFile('b.jpg')],
          ),
          personalCtx,
        ),
      ).rejects.toThrow('db exploded');

      expect(storageMock.upload).toHaveBeenCalledTimes(2);
      expect(storageMock.delete).toHaveBeenCalledTimes(2);
      expect(storageMock.delete).toHaveBeenCalledWith(
        `care-episodes/${episodeId}/file-0.webp`,
      );
      expect(storageMock.delete).toHaveBeenCalledWith(
        `care-episodes/${episodeId}/file-1.webp`,
      );
      expect(eventEmitterMock.emit).not.toHaveBeenCalled();
    });

    it('compensation best-effort: si storage.delete falla se loguea y el error original se propaga', async () => {
      prismaMock.vehicle.findUnique.mockResolvedValue({ id: vehicleId });
      accessMock.assertOwnership.mockResolvedValue(undefined);
      mockStorageUploads(1);
      prismaMock.careEpisode.create.mockRejectedValue(
        new Error('db exploded'),
      );
      storageMock.delete.mockRejectedValue(new Error('storage down'));

      await expect(
        handler.execute(
          makeCommand(
            { workshopName: 'Taller Don Pepe' },
            personalCtx,
            [makeFile('a.jpg')],
          ),
          personalCtx,
        ),
      ).rejects.toThrow('db exploded');

      expect(storageMock.delete).toHaveBeenCalledWith(
        `care-episodes/${episodeId}/file-0.webp`,
      );
      expect(eventEmitterMock.emit).not.toHaveBeenCalled();
    });

    it('no compensation when upload itself fails midway: only ALREADY uploaded blobs are deleted', async () => {
      prismaMock.vehicle.findUnique.mockResolvedValue({ id: vehicleId });
      accessMock.assertOwnership.mockResolvedValue(undefined);
      // Primer upload OK; segundo FALLA → se borra solo el primero.
      storageMock.upload.mockResolvedValueOnce({
        key: `care-episodes/${episodeId}/file-0.webp`,
        url: `care-episodes/${episodeId}/file-0.webp`,
      });
      storageMock.upload.mockRejectedValueOnce(new Error('storage down'));

      await expect(
        handler.execute(
          makeCommand(
            { workshopName: 'Taller Don Pepe' },
            personalCtx,
            [makeFile('a.jpg'), makeFile('b.jpg')],
          ),
          personalCtx,
        ),
      ).rejects.toThrow('storage down');

      expect(storageMock.delete).toHaveBeenCalledTimes(1);
      expect(storageMock.delete).toHaveBeenCalledWith(
        `care-episodes/${episodeId}/file-0.webp`,
      );
      expect(prismaMock.careEpisode.create).not.toHaveBeenCalled();
      expect(eventEmitterMock.emit).not.toHaveBeenCalled();
    });
  });
});