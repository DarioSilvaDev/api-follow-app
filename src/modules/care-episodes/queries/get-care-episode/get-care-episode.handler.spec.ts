// uuid@14 es ESM-only; se mockea antes de importar (transita StorageR2Service)
// — patrón consistente con vehicles.controller.spec.ts / register.handler.spec.ts.
jest.mock('uuid', () => ({ v4: () => 'test-uuid' }));

import { ForbiddenException } from '@nestjs/common';
import { NotFoundException } from '../../../../common/exceptions/not-found.exception';
import { VehicleAccessService } from '../../../../common/authorization/vehicle-access.service';
import type { CurrentContext } from '../../../../common/context/interfaces/current-context.interface';
import type { AuthenticatedUser } from '../../../../common/types/auth.types';
import { GetCareEpisodeHandler } from './get-care-episode.handler';

/**
 * GetCareEpisodeHandler — S1 detalle con proyección por actor.
 *
 * Cubre: proyección dueño/taller/shared, puerta WORKSHOP con membresía
 * activa, 404 sin revelar existencia y firma SOLO de adjuntos activos.
 */
describe('GetCareEpisodeHandler — S1 detail with actor projection', () => {
  let handler: GetCareEpisodeHandler;
  let prismaMock: {
    careEpisode: { findUnique: jest.Mock };
    workshopMember: { findUnique: jest.Mock };
    vehicleOwnership: { findFirst: jest.Mock };
    careEpisodeAttachment: { findMany: jest.Mock };
  };
  let accessMock: { assertOwnershipOrSharedAccess: jest.Mock };
  let storageMock: { getSignedUrl: jest.Mock };

  const careEpisodeId = 'ce-1';
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

  function baseEpisode(overrides: Record<string, unknown> = {}) {
    return {
      id: careEpisodeId,
      vehicleId,
      status: 'open',
      source: 'workshop',
      verification: 'unverified',
      title: 'Cambio de aceite',
      serviceDate: new Date('2026-09-10T10:00:00.000Z'),
      workshopId,
      workshopName: null,
      mileageIn: 12345,
      customerComplaint: 'Ruido al frenar',
      customerNotes: 'Comentario del cliente',
      internalNotes: 'Nota interna del taller',
      checkedInAt: new Date('2026-09-10T09:00:00.000Z'),
      closedAt: null,
      createdAt: new Date('2026-09-10T09:00:00.000Z'),
      vehicle: {
        id: vehicleId,
        licensePlate: 'ABC123',
        manufactureYear: 2019,
        version: {
          name: 'Limited 2.0 Sport',
          model: { name: 'Corolla', brand: { name: 'Toyota' } },
        },
      },
      workshop: { name: 'Taller Test' },
      ...overrides,
    };
  }

  function baseAttachment(overrides: Record<string, unknown> = {}) {
    return {
      id: 'att-1',
      key: `care-episodes/${careEpisodeId}/a.webp`,
      originalName: 'antes.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 1024,
      caption: null,
      phase: 'before',
      uploadedByMemberId: memberId,
      uploadedByUserId: null,
      createdAt: new Date('2026-09-10T10:01:00.000Z'),
      removedAt: null,
      ...overrides,
    };
  }

  beforeEach(() => {
    prismaMock = {
      careEpisode: { findUnique: jest.fn() },
      workshopMember: { findUnique: jest.fn() },
      vehicleOwnership: { findFirst: jest.fn() },
      careEpisodeAttachment: { findMany: jest.fn() },
    };
    accessMock = { assertOwnershipOrSharedAccess: jest.fn() };
    storageMock = { getSignedUrl: jest.fn() };
    handler = new GetCareEpisodeHandler(
      prismaMock as any,
      accessMock as unknown as VehicleAccessService,
      storageMock as any,
    );
  });

  // ──────────────────────────────────────────────────────
  // Existencia y 404
  // ──────────────────────────────────────────────────────

  it('404 cuando el episodio no existe', async () => {
    prismaMock.careEpisode.findUnique.mockResolvedValue(null);

    await expect(
      handler.execute(careEpisodeId, user, personalCtx, false),
    ).rejects.toThrow(NotFoundException);
  });

  // ──────────────────────────────────────────────────────
  // Proyección PERSONAL
  // ──────────────────────────────────────────────────────

  it('dueño vigente: ve customerComplaint pero NO internalNotes', async () => {
    prismaMock.careEpisode.findUnique.mockResolvedValue(baseEpisode());
    accessMock.assertOwnershipOrSharedAccess.mockResolvedValue(undefined);
    prismaMock.vehicleOwnership.findFirst.mockResolvedValue({ id: 'o-1' });
    prismaMock.careEpisodeAttachment.findMany.mockResolvedValue([]);

    const result = await handler.execute(careEpisodeId, user, personalCtx, false);

    expect(result.customerComplaint).toBe('Ruido al frenar');
    expect(result.internalNotes).toBeNull();
    expect(result.customerNotes).toBe('Comentario del cliente');
  });

  it('shared access: NO ve customerComplaint ni internalNotes (neutral)', async () => {
    prismaMock.careEpisode.findUnique.mockResolvedValue(baseEpisode());
    accessMock.assertOwnershipOrSharedAccess.mockResolvedValue(undefined);
    prismaMock.vehicleOwnership.findFirst.mockResolvedValue(null);
    prismaMock.careEpisodeAttachment.findMany.mockResolvedValue([]);

    const result = await handler.execute(careEpisodeId, user, personalCtx, false);

    expect(result.customerComplaint).toBeNull();
    expect(result.internalNotes).toBeNull();
  });

  it('PERSONAL sin acceso (403 del service) → 404 sin revelar existencia', async () => {
    prismaMock.careEpisode.findUnique.mockResolvedValue(baseEpisode());
    accessMock.assertOwnershipOrSharedAccess.mockRejectedValue(
      new ForbiddenException('no access'),
    );

    await expect(
      handler.execute(careEpisodeId, user, personalCtx, false),
    ).rejects.toThrow(NotFoundException);
  });

  // ──────────────────────────────────────────────────────
  // Proyección WORKSHOP
  // ──────────────────────────────────────────────────────

  it('taller del episodio: ve customerComplaint E internalNotes (membresía activa)', async () => {
    prismaMock.careEpisode.findUnique.mockResolvedValue(baseEpisode());
    prismaMock.workshopMember.findUnique.mockResolvedValue({
      workshopId,
      status: 'active',
    });
    prismaMock.careEpisodeAttachment.findMany.mockResolvedValue([]);

    const result = await handler.execute(careEpisodeId, user, workshopCtx, false);

    expect(result.customerComplaint).toBe('Ruido al frenar');
    expect(result.internalNotes).toBe('Nota interna del taller');
    expect(result.workshopName).toBe('Taller Test');
  });

  it('taller de OTRO episodio → 404 (no revelar existencia)', async () => {
    const otherCtx: CurrentContext = {
      type: 'WORKSHOP',
      userId,
      workshopId: otherWorkshopId,
      memberId: 'm-2',
      roleId: 'r-1',
    };
    prismaMock.careEpisode.findUnique.mockResolvedValue(baseEpisode());

    await expect(
      handler.execute(careEpisodeId, user, otherCtx, false),
    ).rejects.toThrow(NotFoundException);
    expect(prismaMock.workshopMember.findUnique).not.toHaveBeenCalled();
  });

  it('WORKSHOP del episodio pero miembro inactivo → 404', async () => {
    prismaMock.careEpisode.findUnique.mockResolvedValue(baseEpisode());
    prismaMock.workshopMember.findUnique.mockResolvedValue({
      workshopId,
      status: 'inactive',
    });

    await expect(
      handler.execute(careEpisodeId, user, workshopCtx, false),
    ).rejects.toThrow(NotFoundException);
  });

  // ──────────────────────────────────────────────────────
  // ?signed=true — firma SOLO activos
  // ──────────────────────────────────────────────────────

  it('?signed=true firma solo adjuntos activos; removidos sin url', async () => {
    prismaMock.careEpisode.findUnique.mockResolvedValue(baseEpisode());
    accessMock.assertOwnershipOrSharedAccess.mockResolvedValue(undefined);
    prismaMock.vehicleOwnership.findFirst.mockResolvedValue({ id: 'o-1' });
    prismaMock.careEpisodeAttachment.findMany.mockResolvedValue([
      baseAttachment(),
      baseAttachment({
        id: 'att-2',
        key: `care-episodes/${careEpisodeId}/b.webp`,
        phase: 'after',
        removedAt: new Date('2026-09-11T10:00:00.000Z'),
        removedByUserId: userId,
      }),
    ]);
    storageMock.getSignedUrl.mockResolvedValue('https://signed/url');

    const result = await handler.execute(careEpisodeId, user, personalCtx, true);

    // Solo el activo fue firmado.
    expect(result.attachments.before[0]).toMatchObject({
      id: 'att-1',
      removed: false,
      url: 'https://signed/url',
    });
    expect(result.attachments.before[0].expiresAt).toBeInstanceOf(Date);
    // Agrupación por fase → 'after' contiene el removido (tombstone visible).
    expect(result.attachments.after[0]).toMatchObject({
      id: 'att-2',
      removed: true,
    });
    expect(result.attachments.after[0].url).toBeUndefined();
    expect(result.attachments.after[0].expiresAt).toBeUndefined();
    expect(storageMock.getSignedUrl).toHaveBeenCalledTimes(1);
    expect(storageMock.getSignedUrl).toHaveBeenCalledWith(
      `care-episodes/${careEpisodeId}/a.webp`,
    );
    // attachmentCount cuenta SOLO activos.
    expect(result.attachmentCount).toBe(1);
  });

  it('sin ?signed=true no firma ningún adjunto', async () => {
    prismaMock.careEpisode.findUnique.mockResolvedValue(baseEpisode());
    accessMock.assertOwnershipOrSharedAccess.mockResolvedValue(undefined);
    prismaMock.vehicleOwnership.findFirst.mockResolvedValue({ id: 'o-1' });
    prismaMock.careEpisodeAttachment.findMany.mockResolvedValue([
      baseAttachment(),
    ]);

    const result = await handler.execute(careEpisodeId, user, personalCtx, false);

    expect(result.attachments.before[0].url).toBeUndefined();
    expect(storageMock.getSignedUrl).not.toHaveBeenCalled();
  });
});