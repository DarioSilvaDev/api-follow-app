import { ConflictException, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import {
  CLAIM_ACCOUNT_REQUIRED_MESSAGE,
  CLAIM_BLOCKED_MESSAGE,
  CLAIM_NOT_FOUND_MESSAGE,
  CLAIM_UNAVAILABLE_MESSAGE,
} from '../../claim-messages';
import { ReviewClaimCommand } from './review-claim.command';
import { ReviewClaimHandler } from './review-claim.handler';

async function capture(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('La promesa debía rechazar y resolvió');
}

describe('ReviewClaimHandler — approve (T11) / reject (T12)', () => {
  let handler: ReviewClaimHandler;
  let prisma: {
    vehicleClaimInvite: { findFirst: jest.Mock; updateMany: jest.Mock };
    vehicleOwnership: { create: jest.Mock };
    vehicleClaimAttempt: { create: jest.Mock };
    $transaction: jest.Mock;
  };
  let eventEmitter: { emit: jest.Mock };

  const id = '11111111-1111-1111-1111-111111111111';
  const vehicleId = '22222222-2222-2222-2222-222222222222';
  const workshopId = '33333333-3333-3333-3333-333333333333';
  const userId = '44444444-4444-4444-4444-444444444444';
  const claimantUserId = '55555555-5555-5555-5555-555555555555';

  function invite(overrides: Record<string, unknown> = {}) {
    return {
      id,
      vehicleId,
      workshopId,
      status: 'manual_review',
      expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
      claimantUserId,
      ...overrides,
    };
  }

  function command(
    action: 'approve' | 'reject' = 'approve',
  ): ReviewClaimCommand {
    return new ReviewClaimCommand(id, workshopId, 'member-1', userId, action);
  }

  beforeEach(() => {
    prisma = {
      vehicleClaimInvite: {
        findFirst: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      vehicleOwnership: { create: jest.fn().mockResolvedValue({}) },
      vehicleClaimAttempt: { create: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation(
      async (callback: (tx: unknown) => Promise<unknown>) => callback(prisma),
    );
    eventEmitter = { emit: jest.fn() };

    handler = new ReviewClaimHandler(
      prisma as never,
      eventEmitter as unknown as EventEmitter2,
    );
  });

  it('invite de otro taller → 404', async () => {
    prisma.vehicleClaimInvite.findFirst.mockResolvedValue(null);

    const error = await capture(handler.execute(command()));

    expect(error).toBeInstanceOf(NotFoundException);
    expect((error as Error).message).toBe(CLAIM_NOT_FOUND_MESSAGE);
  });

  it('approve fuera de manual_review → 409', async () => {
    prisma.vehicleClaimInvite.findFirst.mockResolvedValue(
      invite({ status: 'verified' }),
    );

    const error = await capture(handler.execute(command()));

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as Error).message).toBe(CLAIM_UNAVAILABLE_MESSAGE);
  });

  it('approve de un manual_review vencido → 409 (no aprueba links vencidos)', async () => {
    prisma.vehicleClaimInvite.findFirst.mockResolvedValue(
      invite({ expiresAt: new Date(Date.now() - 1000) }),
    );

    const error = await capture(handler.execute(command()));

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as Error).message).toBe(CLAIM_UNAVAILABLE_MESSAGE);
  });

  it('approve sin cuenta vinculada → 409 con el copy exacto', async () => {
    prisma.vehicleClaimInvite.findFirst.mockResolvedValue(
      invite({ claimantUserId: null }),
    );

    const error = await capture(handler.execute(command()));

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as Error).message).toBe(CLAIM_ACCOUNT_REQUIRED_MESSAGE);
    expect(prisma.vehicleOwnership.create).not.toHaveBeenCalled();
  });

  it('approve exitoso → claimed/ownership_created + ownership + evento', async () => {
    prisma.vehicleClaimInvite.findFirst.mockResolvedValue(invite());

    const result = await handler.execute(command());

    expect(result).toEqual({
      data: { status: 'claimed', outcome: 'ownership_created' },
    });
    expect(prisma.vehicleClaimInvite.updateMany).toHaveBeenCalledWith({
      where: { id, workshopId, status: 'manual_review' },
      data: {
        status: 'claimed',
        usedAt: expect.any(Date),
        claimOutcome: 'ownership_created',
        claimantUserId,
      },
    });
    expect(prisma.vehicleOwnership.create).toHaveBeenCalledWith({
      data: {
        vehicleId,
        userId: claimantUserId,
        type: 'owner',
        startsAt: expect.any(Date),
        endsAt: null,
        acquiredByClaimInviteId: id,
      },
    });
    expect(prisma.vehicleClaimAttempt.create).toHaveBeenCalledWith({
      data: { inviteId: id, outcome: 'claim_success' },
    });
    expect(eventEmitter.emit).toHaveBeenCalledWith(
      'vehicle-claim.claimed',
      expect.objectContaining({
        inviteId: id,
        claimantUserId,
        outcome: 'ownership_created',
      }),
    );
  });

  it('approve con titular activo (P2002) → claim_blocked y 409', async () => {
    prisma.vehicleClaimInvite.findFirst.mockResolvedValue(invite());
    const p2002 = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed on the fields: (`vehicle_id`)',
      { code: 'P2002', clientVersion: '6.19.3' },
    );
    prisma.$transaction
      .mockRejectedValueOnce(p2002)
      .mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) =>
        callback(prisma),
      );

    const error = await capture(handler.execute(command()));

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as Error).message).toBe(CLAIM_BLOCKED_MESSAGE);
    expect(prisma.vehicleClaimInvite.updateMany).toHaveBeenCalledWith({
      where: { id, workshopId, status: 'manual_review' },
      data: {
        status: 'claim_blocked',
        blockedAt: expect.any(Date),
        claimantUserId,
      },
    });
    expect(eventEmitter.emit).toHaveBeenCalledWith(
      'vehicle-claim.blocked',
      expect.objectContaining({ inviteId: id }),
    );
  });

  it('reject exitoso → revoked(manual_review_rejected) + evento', async () => {
    prisma.vehicleClaimInvite.findFirst.mockResolvedValue(invite());

    const result = await handler.execute(command('reject'));

    expect(result).toEqual({
      data: { status: 'revoked', reason: 'manual_review_rejected' },
    });
    expect(prisma.vehicleClaimInvite.updateMany).toHaveBeenCalledWith({
      where: { id, workshopId, status: 'manual_review' },
      data: {
        status: 'revoked',
        revokedAt: expect.any(Date),
        revokeReason: 'manual_review_rejected',
        revokedByUserId: userId,
      },
    });
    expect(prisma.vehicleOwnership.create).not.toHaveBeenCalled();
    expect(eventEmitter.emit).toHaveBeenCalledWith(
      'vehicle-claim.revoked',
      expect.objectContaining({
        inviteId: id,
        reason: 'manual_review_rejected',
      }),
    );
  });

  it('reject fuera de manual_review → 409', async () => {
    prisma.vehicleClaimInvite.findFirst.mockResolvedValue(
      invite({ status: 'claimed' }),
    );

    const error = await capture(handler.execute(command('reject')));

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as Error).message).toBe(CLAIM_UNAVAILABLE_MESSAGE);
  });
});
