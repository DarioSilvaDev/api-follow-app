// uuid@14 es ESM-only; se mockea antes de importar (transita StorageR2Service)
// — patrón consistente con vehicles.controller.spec.ts / register.handler.spec.ts.
jest.mock('uuid', () => ({ v4: () => 'test-uuid' }));

import { ConflictException, ForbiddenException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { NotFoundException } from '../../../../common/exceptions/not-found.exception';
import { AttachCareEpisodeAttachmentsHandler } from './attach-care-episode-attachments.handler';
import { AttachCareEpisodeAttachmentsCommand } from './attach-care-episode-attachments.command';
import { CareEpisodeAttachmentAddedEvent } from '../../events/care-episode-attachment-added.event';

/**
 * AttachCareEpisodeAttachmentsHandler — S4 workshop attach-after.
 *
 * Cubre: 404 sin revelar existencia, 403 source=owner, 409 delivered/
 * cancelled/verified, techo de 15 activos, compensación de blobs si la
 * transacción falla, uploadedByMemberId desde contexto y evento POST-commit.
 */
describe('AttachCareEpisodeAttachmentsHandler — S4 evidence upload', () => {
  let handler: AttachCareEpisodeAttachmentsHandler;
  let prismaMock: {
    careEpisode: { findFirst: jest.Mock };
    $transaction: jest.Mock;
  };
  let storageMock: { upload: jest.Mock; delete: jest.Mock };
  let eventEmitterMock: { emit: jest.Mock };

  const careEpisodeId = 'ce-1';
  const workshopId = 'w-1';
  const memberId = 'm-1';
  const vehicleId = 'v-1';
  const fileKey = `care-episodes/${careEpisodeId}/abc.webp`;

  function makeFile(): Express.Multer.File {
    return {
      fieldname: 'files',
      originalname: 'evidencia.jpg',
      encoding: '7bit',
      mimetype: 'image/jpeg',
      buffer: Buffer.from('data'),
      size: 2048,
      stream: null as any,
      destination: '',
      filename: '',
      path: '',
    };
  }

  function makeCommand(overrides: Partial<AttachCareEpisodeAttachmentsCommand> = {}) {
    return new AttachCareEpisodeAttachmentsCommand(
      overrides.careEpisodeId ?? careEpisodeId,
      overrides.workshopId ?? workshopId,
      overrides.memberId ?? memberId,
      overrides.phase ?? 'after',
      overrides.caption ?? 'Evidencia del servicio',
      overrides.file ?? makeFile(),
    );
  }

  function makeTxMock() {
    return {
      $queryRaw: jest.fn(),
      careEpisodeAttachment: {
        count: jest.fn(),
        create: jest.fn(),
      },
    };
  }

  function episodeState(overrides: Record<string, unknown> = {}) {
    return {
      id: careEpisodeId,
      vehicleId,
      workshopId,
      status: 'open',
      source: 'workshop',
      verification: 'unverified',
      ...overrides,
    };
  }

  beforeEach(() => {
    prismaMock = {
      careEpisode: { findFirst: jest.fn() },
      $transaction: jest.fn(),
    };
    storageMock = { upload: jest.fn(), delete: jest.fn() };
    eventEmitterMock = { emit: jest.fn() };
    handler = new AttachCareEpisodeAttachmentsHandler(
      prismaMock as any,
      storageMock as any,
      eventEmitterMock as unknown as EventEmitter2,
    );
  });

  function mockHappyPath(txMock: ReturnType<typeof makeTxMock>) {
    prismaMock.careEpisode.findFirst.mockResolvedValue(episodeState());
    storageMock.upload.mockResolvedValue({ key: fileKey, url: fileKey });
    prismaMock.$transaction.mockImplementation(
      (cb: (tx: unknown) => unknown) => cb(txMock),
    );
    txMock.$queryRaw.mockResolvedValue([
      {
        status: 'open',
        source: 'workshop',
        verification: 'unverified',
        workshop_id: workshopId,
      },
    ]);
    txMock.careEpisodeAttachment.count.mockResolvedValue(2);
    txMock.careEpisodeAttachment.create.mockResolvedValue({
      id: 'att-1',
      careEpisodeId,
      key: fileKey,
      originalName: 'evidencia.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 2048,
      caption: 'Evidencia del servicio',
      phase: 'after',
      uploadedByMemberId: memberId,
      uploadedByUserId: null,
      createdAt: new Date('2026-09-10T12:00:00.000Z'),
    });
  }

  // ──────────────────────────────────────────────────────
  // 404 / estado
  // ──────────────────────────────────────────────────────

  it('404 cuando el episodio no existe o pertenece a otro taller (no revelar)', async () => {
    prismaMock.careEpisode.findFirst.mockResolvedValue(null);

    await expect(handler.execute(makeCommand())).rejects.toThrow(
      NotFoundException,
    );
    expect(storageMock.upload).not.toHaveBeenCalled();
    expect(eventEmitterMock.emit).not.toHaveBeenCalled();
  });

  it('403 cuando source=owner (no admite evidencia posterior)', async () => {
    prismaMock.careEpisode.findFirst.mockResolvedValue(
      episodeState({ source: 'owner' }),
    );

    await expect(handler.execute(makeCommand())).rejects.toThrow(
      ForbiddenException,
    );
    expect(storageMock.upload).not.toHaveBeenCalled();
  });

  it.each([
    ['delivered', { status: 'delivered' }],
    ['cancelled', { status: 'cancelled' }],
    ['verified', { verification: 'verified' }],
  ])('409 cuando el episodio está %s', async (_name, overrides) => {
    prismaMock.careEpisode.findFirst.mockResolvedValue(
      episodeState(overrides),
    );

    await expect(handler.execute(makeCommand())).rejects.toThrow(
      ConflictException,
    );
    expect(storageMock.upload).not.toHaveBeenCalled();
  });

  // ──────────────────────────────────────────────────────
  // Happy path + evento POST-commit
  // ──────────────────────────────────────────────────────

  it('sube a storage, crea la fila con identity desde contexto y emite evento tras commit', async () => {
    const txMock = makeTxMock();
    mockHappyPath(txMock);

    const result = await handler.execute(makeCommand());

    expect(storageMock.upload).toHaveBeenCalledWith(
      expect.any(Object),
      `care-episodes/${careEpisodeId}`,
    );
    expect(txMock.$queryRaw).toHaveBeenCalled(); // SELECT ... FOR UPDATE
    expect(txMock.careEpisodeAttachment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        careEpisodeId,
        key: fileKey,
        uploadedByMemberId: memberId, // identity desde contexto
        uploadedByUserId: null, // NUNCA desde body
        phase: 'after',
        caption: 'Evidencia del servicio',
      }),
    });
    expect(result).toMatchObject({
      id: 'att-1',
      removed: false,
      uploadedByMemberId: memberId,
    });
    // Evento emitido una sola vez, después del commit (create ya ocurrió).
    expect(eventEmitterMock.emit).toHaveBeenCalledTimes(1);
    expect(eventEmitterMock.emit).toHaveBeenCalledWith(
      'care-episode.attachment.added',
      expect.objectContaining({
        eventName: 'care-episode.attachment.added',
        payload: expect.objectContaining({
          attachmentId: 'att-1',
          careEpisodeId,
          vehicleId,
          key: fileKey,
          phase: 'after',
          uploadedByMemberId: memberId,
        }),
      }),
    );
    expect(eventEmitterMock.emit.mock.calls[0][1]).toBeInstanceOf(
      CareEpisodeAttachmentAddedEvent,
    );
    expect(storageMock.delete).not.toHaveBeenCalled();
  });

  // ──────────────────────────────────────────────────────
  // Techo de 15 activos
  // ──────────────────────────────────────────────────────

  it('409 + compensación cuando activeCount + 1 > 15', async () => {
    const txMock = makeTxMock();
    mockHappyPath(txMock);
    txMock.careEpisodeAttachment.count.mockResolvedValue(15);

    await expect(handler.execute(makeCommand())).rejects.toThrow(
      ConflictException,
    );
    // Compensación: el blob subido se borra.
    expect(storageMock.delete).toHaveBeenCalledWith(fileKey);
    expect(txMock.careEpisodeAttachment.create).not.toHaveBeenCalled();
    expect(eventEmitterMock.emit).not.toHaveBeenCalled();
  });

  // ──────────────────────────────────────────────────────
  // Re-chequeo transaccional + compensación
  // ──────────────────────────────────────────────────────

  it('re-chequea estado dentro de la tx: taller cambiado → 404 + compensación', async () => {
    const txMock = makeTxMock();
    mockHappyPath(txMock);
    // Dentro de la tx el episodio ya no pertenece al taller (cambió estado).
    txMock.$queryRaw.mockResolvedValue([
      {
        status: 'open',
        source: 'workshop',
        verification: 'unverified',
        workshop_id: 'w-other',
      },
    ]);

    await expect(handler.execute(makeCommand())).rejects.toThrow(
      NotFoundException,
    );
    expect(storageMock.delete).toHaveBeenCalledWith(fileKey);
    expect(eventEmitterMock.emit).not.toHaveBeenCalled();
  });

  it('fallo de DB dentro de la tx → compensación de blob + error propagado', async () => {
    const txMock = makeTxMock();
    mockHappyPath(txMock);
    txMock.careEpisodeAttachment.create.mockRejectedValue(
      new Error('db exploded'),
    );

    await expect(handler.execute(makeCommand())).rejects.toThrow(
      'db exploded',
    );
    expect(storageMock.delete).toHaveBeenCalledWith(fileKey);
    expect(eventEmitterMock.emit).not.toHaveBeenCalled();
  });

  it('si la compensación de blob falla, se loguea y el error original se propaga', async () => {
    const txMock = makeTxMock();
    mockHappyPath(txMock);
    txMock.careEpisodeAttachment.create.mockRejectedValue(
      new Error('db exploded'),
    );
    storageMock.delete.mockRejectedValue(new Error('storage down'));

    await expect(handler.execute(makeCommand())).rejects.toThrow(
      'db exploded',
    );
    expect(storageMock.delete).toHaveBeenCalledWith(fileKey);
  });
});