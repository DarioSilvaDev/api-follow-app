import { ConflictException, ForbiddenException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { NotFoundException } from '../../../../common/exceptions/not-found.exception';
import { VerifyCareEpisodeHandler } from './verify-care-episode.handler';
import { VerifyCareEpisodeCommand } from './verify-care-episode.command';

describe('VerifyCareEpisodeHandler — RF-5 workshop confirms owner record', () => {
  let handler: VerifyCareEpisodeHandler;
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

  function makeCommand(overrides: Partial<VerifyCareEpisodeCommand> = {}) {
    return new VerifyCareEpisodeCommand(
      overrides.careEpisodeId ?? careEpisodeId,
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
    handler = new VerifyCareEpisodeHandler(
      prismaMock as any,
      eventEmitterMock as unknown as EventEmitter2,
    );
  });

  // ──────────────────────────────────────────────────────
  // Happy path
  // ──────────────────────────────────────────────────────

  it('verifies an unverified owner record atomically and emits care-episode.verified', async () => {
    prismaMock.careEpisode.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.careEpisode.findUnique.mockResolvedValue({
      id: careEpisodeId,
      vehicleId: 'v-1',
      verification: 'verified',
      verifiedByMemberId: memberId,
      verifiedAt: expect.any(Date),
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
        verification: 'verified',
        verifiedByMemberId: memberId,
        verifiedAt: expect.any(Date),
      },
    });
    expect(result).toEqual(
      expect.objectContaining({ id: careEpisodeId, verification: 'verified' }),
    );
    expect(eventEmitterMock.emit).toHaveBeenCalledTimes(1);
    expect(eventEmitterMock.emit).toHaveBeenCalledWith(
      'care-episode.verified',
      expect.objectContaining({
        careEpisodeId,
        vehicleId: 'v-1',
        workshopId,
        verifiedByMemberId: memberId,
        verifiedAt: expect.any(Date),
      }),
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
      verifiedByMemberId: null,
      verifiedAt: null,
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
      verifiedByMemberId: null,
      verifiedAt: null,
    });

    await expect(handler.execute(makeCommand())).rejects.toThrow(
      ForbiddenException,
    );
    expect(eventEmitterMock.emit).not.toHaveBeenCalled();
  });

  it('200 idempotent when already verified by THIS workshop', async () => {
    prismaMock.careEpisode.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.careEpisode.findUnique.mockResolvedValue({
      id: careEpisodeId,
      vehicleId: 'v-1',
      workshopId,
      source: 'owner',
      verification: 'verified',
      verifiedByMemberId: 'm-99',
      verifiedAt: new Date('2026-09-10T12:00:00.000Z'),
    });
    prismaMock.workshopMember.findUnique.mockResolvedValue({
      workshopId,
    });

    const result = await handler.execute(makeCommand());

    expect(result).toEqual({
      id: careEpisodeId,
      verification: 'verified',
      verifiedByMemberId: 'm-99',
      verifiedAt: new Date('2026-09-10T12:00:00.000Z'),
    });
    expect(eventEmitterMock.emit).not.toHaveBeenCalled();
  });

  it('409 when already verified by ANOTHER workshop', async () => {
    prismaMock.careEpisode.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.careEpisode.findUnique.mockResolvedValue({
      id: careEpisodeId,
      vehicleId: 'v-1',
      workshopId,
      source: 'owner',
      verification: 'verified',
      verifiedByMemberId: 'm-other',
      verifiedAt: new Date('2026-09-10T12:00:00.000Z'),
    });
    prismaMock.workshopMember.findUnique.mockResolvedValue({
      workshopId: otherWorkshopId,
    });

    await expect(handler.execute(makeCommand())).rejects.toThrow(
      ConflictException,
    );
    expect(eventEmitterMock.emit).not.toHaveBeenCalled();
  });
});
