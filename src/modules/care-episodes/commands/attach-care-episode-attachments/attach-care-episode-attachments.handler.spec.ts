// uuid@14 es ESM-only; se mockea antes de importar (transita StorageR2Service)
// — patrón consistente con vehicles.controller.spec.ts / register.handler.spec.ts.
jest.mock('uuid', () => ({ v4: () => 'test-uuid' }));

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
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
 *
 * Además: fallo del storage externo → 503 (nunca 400 ni 409), log con
 * clasificación CONFIG/DEPENDENCY, sin compensación y sin escritura en DB.
 */
describe('AttachCareEpisodeAttachmentsHandler — S4 evidence upload', () => {
  let handler: AttachCareEpisodeAttachmentsHandler;
  let prismaMock: {
    careEpisode: { findFirst: jest.Mock };
    $transaction: jest.Mock;
  };
  let storageMock: { upload: jest.Mock; delete: jest.Mock };
  let eventEmitterMock: { emit: jest.Mock };
  let pinoLoggerMock: { info: jest.Mock; warn: jest.Mock; error: jest.Mock };

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

  function makeCommand(
    overrides: Partial<AttachCareEpisodeAttachmentsCommand> = {},
  ) {
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
    pinoLoggerMock = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    handler = new AttachCareEpisodeAttachmentsHandler(
      pinoLoggerMock as any,
      prismaMock as any,
      storageMock as any,
      eventEmitterMock as unknown as EventEmitter2,
    );
  });

  function mockHappyPath(txMock: ReturnType<typeof makeTxMock>) {
    prismaMock.careEpisode.findFirst.mockResolvedValue(episodeState());
    storageMock.upload.mockResolvedValue({ key: fileKey, url: fileKey });
    prismaMock.$transaction.mockImplementation((cb: (tx: unknown) => unknown) =>
      cb(txMock),
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
    prismaMock.careEpisode.findFirst.mockResolvedValue(episodeState(overrides));

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

    await expect(handler.execute(makeCommand())).rejects.toThrow('db exploded');
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

    await expect(handler.execute(makeCommand())).rejects.toThrow('db exploded');
    expect(storageMock.delete).toHaveBeenCalledWith(fileKey);
  });

  // ──────────────────────────────────────────────────────
  // Fallo del storage externo → 503 (nunca 400 ni 409)
  // ──────────────────────────────────────────────────────

  /** Espía el Logger privado del handler sin ensuciar el tipo con `any`. */
  function spyLoggerError() {
    const logger = (
      handler as unknown as { logger: { error: (...args: unknown[]) => void } }
    ).logger;
    return jest.spyOn(logger, 'error').mockImplementation(() => undefined);
  }

  it('storage.upload rechaza (fallo transitorio) → 503, log DEPENDENCY, sin delete/fila/evento', async () => {
    const txMock = makeTxMock();
    mockHappyPath(txMock); // todo cableado: si el handler llegara a la DB, create correría
    storageMock.upload.mockRejectedValue(
      Object.assign(new Error('connect ECONNREFUSED 10.0.0.1:443'), {
        code: 'ECONNREFUSED',
      }),
    );
    const logSpy = spyLoggerError();

    const err = await handler.execute(makeCommand()).catch((e: unknown) => e);

    // 503 (dependencia externa), NUNCA 409 (no es estado del episodio)
    // ni 400 (no es un archivo inválido).
    expect(err).toBeInstanceOf(ServiceUnavailableException);
    expect((err as ServiceUnavailableException).getStatus()).toBe(503);
    expect(err).not.toBeInstanceOf(ConflictException);
    expect(err).not.toBeInstanceOf(BadRequestException);
    // Mensaje genérico: el detalle del storage no se expone al cliente.
    expect((err as ServiceUnavailableException).message).toBe(
      'No se pudo subir el archivo; intentá nuevamente',
    );

    // Log: una sola línea (sin stack adjunto), clasificada y enriquecida.
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy.mock.calls[0]).toHaveLength(1);
    const logged = logSpy.mock.calls[0][0] as string;
    expect(logged).toContain('kind=DEPENDENCY');
    expect(logged).toContain(`careEpisodeId=${careEpisodeId}`);
    expect(logged).toContain('mime=image/jpeg');
    expect(logged).toContain('sizeBytes=2048');
    expect(logged).toContain('errName=Error');
    expect(logged).toContain('errCode=ECONNREFUSED');

    // Sin blob que compensar, sin transacción → NO se crea fila, NO se emite.
    expect(storageMock.delete).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(txMock.careEpisodeAttachment.create).not.toHaveBeenCalled();
    expect(eventEmitterMock.emit).not.toHaveBeenCalled();
  });

  it('fallo de S3 envuelto por el servicio de storage en BadRequestException → sigue siendo 503 (no 400)', async () => {
    // StorageR2Service.upload() envuelve CUALQUIER fallo de S3/red en un
    // BadRequestException (StorageR2Service propaga el error crudo, pero el
    // handler no asume ninguna de las dos formas): sin esta barrera, un
    // error de red se respondería 400 y el frontend diría "el archivo no
    // es una imagen válida".
    const txMock = makeTxMock();
    mockHappyPath(txMock);
    storageMock.upload.mockRejectedValue(
      new BadRequestException(
        'Failed to upload object evidencia.jpg to storage',
      ),
    );
    const logSpy = spyLoggerError();

    const err = await handler.execute(makeCommand()).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ServiceUnavailableException);
    expect((err as ServiceUnavailableException).getStatus()).toBe(503);
    expect((err as ServiceUnavailableException).message).not.toContain(
      'evidencia.jpg',
    );
    // Sin clasificar el error crudo queda DEPENDENCY (transitorio).
    const logged = logSpy.mock.calls[0][0] as string;
    expect(logged).toContain('kind=DEPENDENCY');
    expect(storageMock.delete).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(eventEmitterMock.emit).not.toHaveBeenCalled();
  });

  it('storage sin configurar (CONFIG) → 503 con mensaje genérico + log kind=CONFIG', async () => {
    const txMock = makeTxMock();
    mockHappyPath(txMock); // todo cableado: si el handler llegara a la DB, create correría
    storageMock.upload.mockRejectedValue(
      new BadRequestException('Storage not configured'),
    );
    const logSpy = spyLoggerError();

    const err = await handler.execute(makeCommand()).catch((e: unknown) => e);

    // El mismo 503 al cliente (la respuesta NO distingue config de red):
    // revelar "not configured" fugaría internals del server (AGENTS.md §23).
    expect(err).toBeInstanceOf(ServiceUnavailableException);
    expect((err as ServiceUnavailableException).getStatus()).toBe(503);
    expect((err as ServiceUnavailableException).message).toBe(
      'No se pudo subir el archivo; intentá nuevamente',
    );

    // La distinción vive sólo en el log.
    expect(logSpy).toHaveBeenCalledTimes(1);
    const logged = logSpy.mock.calls[0][0] as string;
    expect(logged).toContain('kind=CONFIG');
    expect(logged).toContain('errName=BadRequestException');
    expect(logged).not.toContain('kind=DEPENDENCY');

    expect(storageMock.delete).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(txMock.careEpisodeAttachment.create).not.toHaveBeenCalled();
    expect(eventEmitterMock.emit).not.toHaveBeenCalled();
  });
});
