import { ConflictException, ForbiddenException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { NotFoundException } from '../../../../common/exceptions/not-found.exception';
import { RejectCareEpisodeHandler } from './reject-care-episode.handler';
import { RejectCareEpisodeCommand } from './reject-care-episode.command';

/**
 * RejectCareEpisodeHandler — RF-9 / D-202..D-205.
 *
 * Matriz espejo de verify-care-episode.handler.spec.ts + las ramas propias
 * del rechazo (idempotencia sin sobrescribir el motivo, 409 sobre verified,
 * 409 defensivo entre talleres) y la emisión del evento SOLO en commit.
 */
describe('RejectCareEpisodeHandler — RF-9 workshop rejects owner record', () => {
  let handler: RejectCareEpisodeHandler;
  let prismaMock: {
    careEpisode: {
      updateMany: jest.Mock;
      findUnique: jest.Mock;
    };
    workshopMember: { findUnique: jest.Mock };
  };
  let eventEmitterMock: { emit: jest.Mock };

  const careEpisodeId = 'ce-1';
  const workshopId = 'w-1';
  const otherWorkshopId = 'w-2';
  const memberId = 'm-1';
  const reason = 'El kilometraje no coincide con el último service';

  function makeCommand(overrides: Partial<RejectCareEpisodeCommand> = {}) {
    return new RejectCareEpisodeCommand(
      overrides.careEpisodeId ?? careEpisodeId,
      overrides.reason !== undefined ? overrides.reason : reason,
      overrides.workshopId ?? workshopId,
      overrides.memberId ?? memberId,
    );
  }

  beforeEach(() => {
    prismaMock = {
      careEpisode: {
        updateMany: jest.fn(),
        findUnique: jest.fn(),
      },
      workshopMember: { findUnique: jest.fn() },
    };
    eventEmitterMock = { emit: jest.fn() };
    handler = new RejectCareEpisodeHandler(
      prismaMock as any,
      eventEmitterMock as unknown as EventEmitter2,
    );
  });

  // ──────────────────────────────────────────────────────
  // Happy path
  // ──────────────────────────────────────────────────────

  it('rejects an unverified owner record atomically and emits care-episode.rejected', async () => {
    prismaMock.careEpisode.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.careEpisode.findUnique.mockResolvedValue({
      id: careEpisodeId,
      vehicleId: 'v-1',
      verification: 'rejected',
      rejectedByMemberId: memberId,
      rejectedAt: expect.any(Date),
      rejectionReason: reason,
    });

    const result = await handler.execute(makeCommand());

    expect(prismaMock.careEpisode.updateMany).toHaveBeenCalledWith({
      where: {
        id: careEpisodeId,
        workshopId,
        source: 'owner',
        verification: 'unverified',
      },
      data: {
        verification: 'rejected',
        rejectedByMemberId: memberId,
        rejectedAt: expect.any(Date),
        rejectionReason: reason,
      },
    });
    expect(result).toEqual({
      id: careEpisodeId,
      verification: 'rejected',
      rejectedByMemberId: memberId,
      rejectedAt: expect.any(Date),
      rejectionReason: reason,
    });
    expect(eventEmitterMock.emit).toHaveBeenCalledTimes(1);
    expect(eventEmitterMock.emit).toHaveBeenCalledWith(
      'care-episode.rejected',
      expect.objectContaining({
        careEpisodeId,
        vehicleId: 'v-1',
        workshopId,
        rejectedByMemberId: memberId,
        rejectedAt: expect.any(Date),
        rejectionReason: reason,
      }),
    );
  });

  it('persists rejectionReason as NULL when the workshop rejects without reason', async () => {
    prismaMock.careEpisode.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.careEpisode.findUnique.mockResolvedValue({
      id: careEpisodeId,
      vehicleId: 'v-1',
      verification: 'rejected',
      rejectedByMemberId: memberId,
      rejectedAt: expect.any(Date),
      rejectionReason: null,
    });

    const result = await handler.execute(makeCommand({ reason: null }));

    expect(prismaMock.careEpisode.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ rejectionReason: null }),
      }),
    );
    expect(result.rejectionReason).toBeNull();
    expect(eventEmitterMock.emit).toHaveBeenCalledWith(
      'care-episode.rejected',
      expect.objectContaining({ rejectionReason: null }),
    );
  });

  it('does NOT emit the event when the atomic update does not match', async () => {
    prismaMock.careEpisode.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.careEpisode.findUnique.mockResolvedValue(null);

    await expect(handler.execute(makeCommand())).rejects.toThrow(
      NotFoundException,
    );
    expect(eventEmitterMock.emit).not.toHaveBeenCalled();
  });

  // ──────────────────────────────────────────────────────
  // count === 0 → re-read decision tree
  // ──────────────────────────────────────────────────────

  it('404 when the care episode does not exist', async () => {
    prismaMock.careEpisode.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.careEpisode.findUnique.mockResolvedValue(null);

    await expect(handler.execute(makeCommand())).rejects.toThrow(
      NotFoundException,
    );
    expect(eventEmitterMock.emit).not.toHaveBeenCalled();
  });

  it('404 when the record belongs to another workshop (no existence leak)', async () => {
    prismaMock.careEpisode.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.careEpisode.findUnique.mockResolvedValue({
      id: careEpisodeId,
      vehicleId: 'v-1',
      workshopId: otherWorkshopId,
      source: 'owner',
      verification: 'unverified',
      rejectedByMemberId: null,
      rejectedAt: null,
      rejectionReason: null,
    });

    await expect(handler.execute(makeCommand())).rejects.toThrow(
      NotFoundException,
    );
    expect(eventEmitterMock.emit).not.toHaveBeenCalled();
  });

  it('403 when the record was created by a workshop (already trusted by origin)', async () => {
    prismaMock.careEpisode.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.careEpisode.findUnique.mockResolvedValue({
      id: careEpisodeId,
      vehicleId: 'v-1',
      workshopId,
      source: 'workshop',
      verification: 'verified',
      rejectedByMemberId: null,
      rejectedAt: null,
      rejectionReason: null,
    });

    await expect(handler.execute(makeCommand())).rejects.toThrow(
      ForbiddenException,
    );
    expect(eventEmitterMock.emit).not.toHaveBeenCalled();
  });

  it('409 when the record was already VERIFIED (no reject after verify)', async () => {
    prismaMock.careEpisode.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.careEpisode.findUnique.mockResolvedValue({
      id: careEpisodeId,
      vehicleId: 'v-1',
      workshopId,
      source: 'owner',
      verification: 'verified',
      rejectedByMemberId: null,
      rejectedAt: null,
      rejectionReason: null,
    });

    await expect(handler.execute(makeCommand())).rejects.toThrow(
      ConflictException,
    );
    expect(prismaMock.workshopMember.findUnique).not.toHaveBeenCalled();
    expect(eventEmitterMock.emit).not.toHaveBeenCalled();
  });

  it('200 idempotent when already rejected by THIS workshop: keeps the ORIGINAL reason (no overwrite)', async () => {
    const originalReason = 'Motivo original del taller';
    prismaMock.careEpisode.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.careEpisode.findUnique.mockResolvedValue({
      id: careEpisodeId,
      vehicleId: 'v-1',
      workshopId,
      source: 'owner',
      verification: 'rejected',
      rejectedByMemberId: 'm-99',
      rejectedAt: new Date('2026-11-10T12:00:00.000Z'),
      rejectionReason: originalReason,
    });
    prismaMock.workshopMember.findUnique.mockResolvedValue({
      workshopId,
    });

    const result = await handler.execute(
      makeCommand({ reason: 'Otro motivo que NO debería persistirse' }),
    );

    expect(result).toEqual({
      id: careEpisodeId,
      verification: 'rejected',
      rejectedByMemberId: 'm-99',
      rejectedAt: new Date('2026-11-10T12:00:00.000Z'),
      rejectionReason: originalReason,
    });
    // Ni una segunda escritura ni un segundo evento.
    expect(prismaMock.careEpisode.updateMany).toHaveBeenCalledTimes(1);
    expect(eventEmitterMock.emit).not.toHaveBeenCalled();
  });

  it('409 when already rejected by ANOTHER workshop (defensive branch)', async () => {
    prismaMock.careEpisode.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.careEpisode.findUnique.mockResolvedValue({
      id: careEpisodeId,
      vehicleId: 'v-1',
      workshopId,
      source: 'owner',
      verification: 'rejected',
      rejectedByMemberId: 'm-other',
      rejectedAt: new Date('2026-11-10T12:00:00.000Z'),
      rejectionReason: 'Motivo ajeno',
    });
    prismaMock.workshopMember.findUnique.mockResolvedValue({
      workshopId: otherWorkshopId,
    });

    await expect(handler.execute(makeCommand())).rejects.toThrow(
      ConflictException,
    );
    expect(eventEmitterMock.emit).not.toHaveBeenCalled();
  });

  it('409 when rejected without a registered actor (cannot prove it is ours)', async () => {
    prismaMock.careEpisode.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.careEpisode.findUnique.mockResolvedValue({
      id: careEpisodeId,
      vehicleId: 'v-1',
      workshopId,
      source: 'owner',
      verification: 'rejected',
      rejectedByMemberId: null,
      rejectedAt: new Date('2026-11-10T12:00:00.000Z'),
      rejectionReason: null,
    });

    await expect(handler.execute(makeCommand())).rejects.toThrow(
      ConflictException,
    );
    expect(eventEmitterMock.emit).not.toHaveBeenCalled();
  });
});
