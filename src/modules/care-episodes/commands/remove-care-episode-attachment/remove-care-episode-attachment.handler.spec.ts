// uuid@14 es ESM-only; se mockea antes de importar (transita StorageR2Service)
// — patrón consistente con vehicles.controller.spec.ts / register.handler.spec.ts.
jest.mock('uuid', () => ({ v4: () => 'test-uuid' }));

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { NotFoundException } from '../../../../common/exceptions/not-found.exception';
import { VehicleAccessService } from '../../../../common/authorization/vehicle-access.service';
import type { CurrentContext } from '../../../../common/context/interfaces/current-context.interface';
import type { AuthenticatedUser } from '../../../../common/types/auth.types';
import { RemoveCareEpisodeAttachmentHandler } from './remove-care-episode-attachment.handler';
import { RemoveCareEpisodeAttachmentCommand } from './remove-care-episode-attachment.command';
import { CareEpisodeAttachmentRemovedEvent } from '../../events/care-episode-attachment-removed.event';

/**
 * RemoveCareEpisodeAttachmentHandler — S5 void auditado.
 *
 * Cubre la matriz de gates: super_admin (0), frozen verified/cancelled (1),
 * uploader self (2a), dueño con razón (2b), limpieza taller de huérfano (2c),
 * 403 resto, 404 sin revelar existencia, idempotencia (409 doble void),
 * blob best-effort y evento con rol de auditoría.
 */
describe('RemoveCareEpisodeAttachmentHandler — S5 audited void', () => {
  let handler: RemoveCareEpisodeAttachmentHandler;
  let prismaMock: {
    careEpisodeAttachment: { findFirst: jest.Mock; update: jest.Mock };
    workshopMember: { findUnique: jest.Mock };
    systemRole: { findUnique: jest.Mock };
    systemRoleAssignment: { findFirst: jest.Mock };
    $transaction: jest.Mock;
  };
  let accessMock: { assertOwnership: jest.Mock };
  let storageMock: { delete: jest.Mock };
  let eventEmitterMock: { emit: jest.Mock };

  const careEpisodeId = 'ce-1';
  const attachmentId = 'att-1';
  const key = `care-episodes/${careEpisodeId}/a.webp`;
  const vehicleId = 'v-1';
  const workshopId = 'w-1';
  const otherWorkshopId = 'w-2';
  const userId = 'user-1';
  const memberId = 'm-1';

  const personalCtx: CurrentContext = { type: 'PERSONAL', userId };
  const workshopCtx: CurrentContext = {
    type: 'WORKSHOP',
    userId,
    workshopId,
    memberId,
    roleId: 'r-1',
  };
  const user: AuthenticatedUser = { id: userId, email: 'u@test.com' };

  const episode = {
    id: careEpisodeId,
    vehicleId,
    workshopId,
    status: 'open',
    verification: 'unverified',
    source: 'workshop',
  };

  function makeAttachment(
    overrides: Partial<{
      uploadedByUserId: string | null;
      uploadedByMemberId: string | null;
      removedAt: Date | null;
      episode?: Partial<typeof episode>;
    }> = {},
  ) {
    return {
      id: attachmentId,
      key,
      uploadedByUserId: null,
      uploadedByMemberId: memberId,
      removedAt: null,
      careEpisode: { ...episode, ...overrides.episode },
      ...overrides,
    };
  }

  function makeCommand(
    ctx: CurrentContext,
    reason: string | null = null,
    overrides: Partial<RemoveCareEpisodeAttachmentCommand> = {},
  ) {
    return new RemoveCareEpisodeAttachmentCommand(
      overrides.careEpisodeId ?? careEpisodeId,
      overrides.attachmentId ?? attachmentId,
      reason,
      ctx,
      user,
    );
  }

  function mockVoidTransaction() {
    prismaMock.$transaction.mockImplementation(
      (cb: (tx: unknown) => unknown) => {
        const tx = {
          careEpisodeAttachment: { update: prismaMock.careEpisodeAttachment.update },
        };
        return cb(tx);
      },
    );
  }

  beforeEach(() => {
    prismaMock = {
      careEpisodeAttachment: { findFirst: jest.fn(), update: jest.fn() },
      workshopMember: { findUnique: jest.fn() },
      systemRole: { findUnique: jest.fn() },
      systemRoleAssignment: { findFirst: jest.fn() },
      $transaction: jest.fn(),
    };
    accessMock = { assertOwnership: jest.fn() };
    storageMock = { delete: jest.fn() };
    eventEmitterMock = { emit: jest.fn() };
    handler = new RemoveCareEpisodeAttachmentHandler(
      prismaMock as any,
      accessMock as unknown as VehicleAccessService,
      storageMock as any,
      eventEmitterMock as unknown as EventEmitter2,
    );
    // Default: usuario NO super_admin.
    prismaMock.systemRole.findUnique.mockResolvedValue(null);
    mockVoidTransaction();
    prismaMock.careEpisodeAttachment.update.mockResolvedValue({ id: attachmentId });
    storageMock.delete.mockResolvedValue(undefined);
  });

  // ──────────────────────────────────────────────────────
  // Existencia / contexto / idempotencia
  // ──────────────────────────────────────────────────────

  it('404 cuando el adjunto no existe (scoped por careEpisodeId)', async () => {
    prismaMock.careEpisodeAttachment.findFirst.mockResolvedValue(null);

    await expect(handler.execute(makeCommand(personalCtx))).rejects.toThrow(
      NotFoundException,
    );
    expect(eventEmitterMock.emit).not.toHaveBeenCalled();
  });

  it('403 para contextos DEALERSHIP/PLATFORM (sin path en S5)', async () => {
    prismaMock.careEpisodeAttachment.findFirst.mockResolvedValue(
      makeAttachment(),
    );
    const dealerCtx: CurrentContext = {
      type: 'DEALERSHIP',
      userId,
      dealershipId: 'd-1',
    };

    await expect(handler.execute(makeCommand(dealerCtx))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('404 cuando WORKSHOP intenta remover de episodio de otro taller', async () => {
    // Episodio del adjunto pertenece a w-1; el contexto activo es w-2.
    prismaMock.careEpisodeAttachment.findFirst.mockResolvedValue(
      makeAttachment(),
    );
    const otherCtx: CurrentContext = {
      type: 'WORKSHOP',
      userId,
      workshopId: otherWorkshopId,
      memberId: 'm-9',
      roleId: 'r-1',
    };

    await expect(handler.execute(makeCommand(otherCtx))).rejects.toThrow(
      NotFoundException,
    );
    expect(prismaMock.careEpisodeAttachment.update).not.toHaveBeenCalled();
  });

  it('409 al intentar un doble void (attachment ya eliminado)', async () => {
    prismaMock.careEpisodeAttachment.findFirst.mockResolvedValue(
      makeAttachment({
        removedAt: new Date('2026-09-11T09:00:00.000Z'),
        removedByUserId: userId,
      }),
    );

    await expect(handler.execute(makeCommand(personalCtx))).rejects.toThrow(
      ConflictException,
    );
    expect(prismaMock.careEpisodeAttachment.update).not.toHaveBeenCalled();
    expect(eventEmitterMock.emit).not.toHaveBeenCalled();
  });

  // ──────────────────────────────────────────────────────
  // GATE 1 — FROZEN (verified / cancelled), sin super_admin
  // ──────────────────────────────────────────────────────

  it.each([
    ['verification verified', { verification: 'verified' }],
    ['status cancelled', { status: 'cancelled' }],
  ])('409 cuando el episodio es %s (ni uploader ni dueño pueden)', async (_name, ep) => {
    prismaMock.careEpisodeAttachment.findFirst.mockResolvedValue(
      makeAttachment({ episode: ep }),
    );

    await expect(
      handler.execute(makeCommand(personalCtx, 'duplicada')),
    ).rejects.toThrow(ConflictException);
    expect(prismaMock.careEpisodeAttachment.update).not.toHaveBeenCalled();
  });

  // ──────────────────────────────────────────────────────
  // GATE 2a — Uploader self-removal
  // ──────────────────────────────────────────────────────

  it('PERSONAL: uploader se quita su propia evidencia → OK, removedReason NULL aunque llegue una razón', async () => {
    prismaMock.careEpisodeAttachment.findFirst.mockResolvedValue(
      makeAttachment({
        uploadedByUserId: userId,
        uploadedByMemberId: null,
      }),
    );

    await handler.execute(makeCommand(personalCtx, 'duplicada'));

    expect(prismaMock.careEpisodeAttachment.update).toHaveBeenCalledWith({
      where: { id: attachmentId },
      data: {
        removedAt: expect.any(Date),
        removedByUserId: userId,
        removedByMemberId: null,
        removedReason: null, // self-removal: sin razón
      },
    });
    expect(storageMock.delete).toHaveBeenCalledWith(key);
    expect(eventEmitterMock.emit).toHaveBeenCalledTimes(1);
    const [name, event] = eventEmitterMock.emit.mock.calls[0];
    expect(name).toBe('care-episode.attachment.removed');
    expect(event).toBeInstanceOf(CareEpisodeAttachmentRemovedEvent);
    expect(event.payload).toMatchObject({
      attachmentId,
      careEpisodeId,
      vehicleId,
      key,
      removedByUserId: userId,
      removedByMemberId: null,
      removedReason: null,
      audit: 'uploader',
    });
  });

  it('WORKSHOP: miembro se quita su propia evidencia → OK, actor MEMBER', async () => {
    prismaMock.careEpisodeAttachment.findFirst.mockResolvedValue(
      makeAttachment({ uploadedByMemberId: memberId }),
    );

    await handler.execute(makeCommand(workshopCtx, null));

    expect(prismaMock.careEpisodeAttachment.update).toHaveBeenCalledWith({
      where: { id: attachmentId },
      data: expect.objectContaining({
        removedByUserId: null,
        removedByMemberId: memberId,
        removedReason: null,
      }),
    });
    expect(eventEmitterMock.emit.mock.calls[0][1].payload).toMatchObject({
      audit: 'uploader',
      removedByMemberId: memberId,
    });
  });

  // ──────────────────────────────────────────────────────
  // GATE 2b — Dueño actual quitando subida de propietario
  // ──────────────────────────────────────────────────────

  it('PERSONAL dueño quita subida de propietario CON razón → OK (audit current_owner)', async () => {
    prismaMock.careEpisodeAttachment.findFirst.mockResolvedValue(
      makeAttachment({
        uploadedByUserId: 'former-owner',
        uploadedByMemberId: null,
      }),
    );
    accessMock.assertOwnership.mockResolvedValue(undefined);

    await handler.execute(makeCommand(personalCtx, 'sin_valor'));

    expect(accessMock.assertOwnership).toHaveBeenCalledWith({
      vehicleId,
      user,
    });
    expect(prismaMock.careEpisodeAttachment.update).toHaveBeenCalledWith({
      where: { id: attachmentId },
      data: expect.objectContaining({
        removedByUserId: userId,
        removedReason: 'sin_valor',
      }),
    });
    expect(eventEmitterMock.emit.mock.calls[0][1].payload).toMatchObject({
      audit: 'current_owner',
      removedReason: 'sin_valor',
    });
  });

  it('PERSONAL dueño quita subida de propietario SIN razón → 400', async () => {
    prismaMock.careEpisodeAttachment.findFirst.mockResolvedValue(
      makeAttachment({
        uploadedByUserId: 'former-owner',
        uploadedByMemberId: null,
      }),
    );
    accessMock.assertOwnership.mockResolvedValue(undefined);

    await expect(handler.execute(makeCommand(personalCtx, null))).rejects.toThrow(
      BadRequestException,
    );
    expect(prismaMock.careEpisodeAttachment.update).not.toHaveBeenCalled();
  });

  it('PERSONAL no dueño (assertOwnership falla) → 403', async () => {
    prismaMock.careEpisodeAttachment.findFirst.mockResolvedValue(
      makeAttachment({
        uploadedByUserId: 'former-owner',
        uploadedByMemberId: null,
      }),
    );
    accessMock.assertOwnership.mockRejectedValue(new ForbiddenException('nope'));

    await expect(
      handler.execute(makeCommand(personalCtx, 'duplicada')),
    ).rejects.toThrow(ForbiddenException);
    expect(prismaMock.careEpisodeAttachment.update).not.toHaveBeenCalled();
  });

  it('PERSONAL intenta remover evidencia del taller → 403 específico', async () => {
    prismaMock.careEpisodeAttachment.findFirst.mockResolvedValue(
      makeAttachment({ uploadedByMemberId: memberId }),
    );

    await expect(
      handler.execute(makeCommand(personalCtx, 'duplicada')),
    ).rejects.toThrow(
      new ForbiddenException('El propietario no puede eliminar evidencias del taller'),
    );
  });

  // ──────────────────────────────────────────────────────
  // GATE 2c — Limpieza de huérfano (uploader inactivo/ausente)
  // ──────────────────────────────────────────────────────

  it('WORKSHOP: uploader ya no es miembro activo → OK con razón (audit workshop_cleanup)', async () => {
    prismaMock.careEpisodeAttachment.findFirst.mockResolvedValue(
      makeAttachment({ uploadedByMemberId: 'left-member' }),
    );
    prismaMock.workshopMember.findUnique.mockResolvedValue({
      workshopId,
      status: 'inactive',
    });

    await handler.execute(makeCommand(workshopCtx, 'sin_valor'));

    expect(prismaMock.workshopMember.findUnique).toHaveBeenCalledWith({
      where: { id: 'left-member' },
      select: { workshopId: true, status: true },
    });
    expect(prismaMock.careEpisodeAttachment.update).toHaveBeenCalledWith({
      where: { id: attachmentId },
      data: expect.objectContaining({
        removedByMemberId: memberId,
        removedReason: 'sin_valor',
      }),
    });
    expect(eventEmitterMock.emit.mock.calls[0][1].payload).toMatchObject({
      audit: 'workshop_cleanup',
    });
  });

  it('WORKSHOP: limpieza de huérfano SIN razón → 400', async () => {
    prismaMock.careEpisodeAttachment.findFirst.mockResolvedValue(
      makeAttachment({ uploadedByMemberId: 'left-member' }),
    );
    prismaMock.workshopMember.findUnique.mockResolvedValue(null);

    await expect(handler.execute(makeCommand(workshopCtx, null))).rejects.toThrow(
      BadRequestException,
    );
    expect(prismaMock.careEpisodeAttachment.update).not.toHaveBeenCalled();
  });

  it('WORKSHOP: uploader es miembro activo y actor ≠ uploader → 403', async () => {
    prismaMock.careEpisodeAttachment.findFirst.mockResolvedValue(
      makeAttachment({ uploadedByMemberId: 'other-member' }),
    );
    prismaMock.workshopMember.findUnique.mockResolvedValue({
      workshopId,
      status: 'active',
    });

    await expect(
      handler.execute(makeCommand(workshopCtx, 'duplicada')),
    ).rejects.toThrow(ForbiddenException);
  });

  // ──────────────────────────────────────────────────────
  // GATE 0 — super_admin
  // ──────────────────────────────────────────────────────

  it('super_admin puede remover episodio verified, sin razón, con auditoría', async () => {
    prismaMock.careEpisodeAttachment.findFirst.mockResolvedValue(
      makeAttachment({
        uploadedByUserId: 'former-owner',
        uploadedByMemberId: null,
        episode: { verification: 'verified' },
      }),
    );
    prismaMock.systemRole.findUnique.mockResolvedValue({ id: 'sr-1' });
    prismaMock.systemRoleAssignment.findFirst.mockResolvedValue({ id: 'sa-1' });

    await handler.execute(makeCommand(personalCtx, null));

    expect(prismaMock.careEpisodeAttachment.update).toHaveBeenCalledWith({
      where: { id: attachmentId },
      data: expect.objectContaining({
        removedByUserId: userId,
        removedReason: null,
      }),
    });
    expect(eventEmitterMock.emit.mock.calls[0][1].payload).toMatchObject({
      audit: 'super_admin',
      removedReason: null,
    });
  });

  // ──────────────────────────────────────────────────────
  // Blob best-effort + evento
  // ──────────────────────────────────────────────────────

  it('si storage.delete falla, se loguea y el evento igual se emite', async () => {
    prismaMock.careEpisodeAttachment.findFirst.mockResolvedValue(
      makeAttachment({ uploadedByMemberId: memberId }),
    );
    storageMock.delete.mockRejectedValue(new Error('storage down'));

    await expect(
      handler.execute(makeCommand(workshopCtx, null)),
    ).resolves.toBeUndefined();
    // Void se preservó.
    expect(prismaMock.careEpisodeAttachment.update).toHaveBeenCalled();
    expect(eventEmitterMock.emit).toHaveBeenCalledTimes(1);
  });

  it('emite evento SOLO con identity derivada del contexto (nunca del body)', async () => {
    prismaMock.careEpisodeAttachment.findFirst.mockResolvedValue(
      makeAttachment({
        uploadedByUserId: userId,
        uploadedByMemberId: null,
      }),
    );
    // Se pasa una razón en el body; para self-removal debe quedar null.
    await handler.execute(makeCommand(personalCtx, 'privacidad'));

    const [, event] = eventEmitterMock.emit.mock.calls[0];
    expect(event.payload).toMatchObject({
      removedByUserId: userId,
      removedByMemberId: null,
      removedReason: null,
      audit: 'uploader',
    });
  });
});