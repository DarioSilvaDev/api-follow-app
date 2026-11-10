import { ConflictException, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  CLAIM_MANUAL_REVIEW_REJECT_MESSAGE,
  CLAIM_NOT_FOUND_MESSAGE,
  CLAIM_UNAVAILABLE_MESSAGE,
} from '../../claim-messages';
import { RevokeClaimCommand } from './revoke-claim.command';
import { RevokeClaimHandler } from './revoke-claim.handler';

async function capture(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('La promesa debía rechazar y resolvió');
}

/** Primer argumento de la primera llamada, tipado para ESLint. */
function firstArg<T>(mock: jest.Mock): T {
  const calls = mock.mock.calls as unknown[][];
  return calls[0][0] as T;
}

describe('RevokeClaimHandler — T13/T14', () => {
  let handler: RevokeClaimHandler;
  let prisma: {
    vehicleClaimInvite: { findFirst: jest.Mock; updateMany: jest.Mock };
    vehicleOwnership: { updateMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let eventEmitter: { emit: jest.Mock };

  const id = '11111111-1111-1111-1111-111111111111';
  const vehicleId = '22222222-2222-2222-2222-222222222222';
  const workshopId = '33333333-3333-3333-3333-333333333333';
  const userId = '44444444-4444-4444-4444-444444444444';

  function invite(overrides: Record<string, unknown> = {}) {
    return {
      id,
      vehicleId,
      workshopId,
      status: 'pending',
      expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
      claimOutcome: null,
      ...overrides,
    };
  }

  function command(): RevokeClaimCommand {
    return new RevokeClaimCommand(id, workshopId, userId, 'motivo libre');
  }

  beforeEach(() => {
    prisma = {
      vehicleClaimInvite: {
        findFirst: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      vehicleOwnership: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation(
      async (callback: (tx: unknown) => Promise<unknown>) => callback(prisma),
    );
    eventEmitter = { emit: jest.fn() };

    handler = new RevokeClaimHandler(
      prisma as never,
      eventEmitter as unknown as EventEmitter2,
    );
  });

  it('invite de otro taller → 404', async () => {
    prisma.vehicleClaimInvite.findFirst.mockResolvedValue(null);

    const error = await capture(handler.execute(command()));

    expect(error).toBeInstanceOf(NotFoundException);
    expect((error as Error).message).toBe(CLAIM_NOT_FOUND_MESSAGE);
    expect(prisma.vehicleClaimInvite.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id, workshopId } }),
    );
  });

  it.each(['revoked', 'claim_blocked'] as const)(
    '%s → 409 (ya no hay link vivo)',
    async (status) => {
      prisma.vehicleClaimInvite.findFirst.mockResolvedValue(invite({ status }));

      const error = await capture(handler.execute(command()));

      expect(error).toBeInstanceOf(ConflictException);
      expect((error as Error).message).toBe(CLAIM_UNAVAILABLE_MESSAGE);
    },
  );

  it('expired → 409', async () => {
    prisma.vehicleClaimInvite.findFirst.mockResolvedValue(
      invite({ status: 'expired' }),
    );

    const error = await capture(handler.execute(command()));

    expect(error).toBeInstanceOf(ConflictException);
  });

  it('manual_review → 409 y guía a Rechazar (no revoca en silencio)', async () => {
    prisma.vehicleClaimInvite.findFirst.mockResolvedValue(
      invite({ status: 'manual_review' }),
    );

    const error = await capture(handler.execute(command()));

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as Error).message).toBe(CLAIM_MANUAL_REVIEW_REJECT_MESSAGE);
    expect(prisma.vehicleClaimInvite.updateMany).not.toHaveBeenCalled();
    expect(eventEmitter.emit).not.toHaveBeenCalled();
  });

  it('pending → revocado por taller sin tocar ownership', async () => {
    prisma.vehicleClaimInvite.findFirst.mockResolvedValue(invite());

    const result = await handler.execute(command());

    expect(result).toEqual({
      data: {
        status: 'revoked',
        reason: 'by_workshop',
        ownershipUndone: false,
      },
    });
    expect(prisma.vehicleOwnership.updateMany).not.toHaveBeenCalled();
    const revokeArgs = firstArg<{
      where: { id: string; workshopId: string; status: string };
      data: {
        status: string;
        revokedAt: Date;
        revokeReason: string;
        revokedByUserId: string;
      };
    }>(prisma.vehicleClaimInvite.updateMany);
    expect(revokeArgs.where).toEqual({ id, workshopId, status: 'pending' });
    expect(revokeArgs.data.status).toBe('revoked');
    expect(revokeArgs.data.revokedAt).toBeInstanceOf(Date);
    expect(revokeArgs.data.revokeReason).toBe('by_workshop');
    expect(revokeArgs.data.revokedByUserId).toBe(userId);
    expect(eventEmitter.emit).toHaveBeenCalledWith(
      'vehicle-claim.revoked',
      expect.objectContaining({ inviteId: id, reason: 'by_workshop' }),
    );
  });

  it('claimed/ownership_created → cierra el ownership y devuelve ownershipUndone', async () => {
    prisma.vehicleClaimInvite.findFirst.mockResolvedValue(
      invite({ status: 'claimed', claimOutcome: 'ownership_created' }),
    );

    const result = await handler.execute(command());

    expect(result.data.ownershipUndone).toBe(true);
    const ownershipArgs = firstArg<{
      where: { acquiredByClaimInviteId: string; endsAt: null };
      data: { endsAt: Date };
    }>(prisma.vehicleOwnership.updateMany);
    expect(ownershipArgs.where).toEqual({
      acquiredByClaimInviteId: id,
      endsAt: null,
    });
    expect(ownershipArgs.data.endsAt).toBeInstanceOf(Date);

    const revokeArgs = firstArg<{
      where: { id: string; workshopId: string; status: string };
      data: { status: string };
    }>(prisma.vehicleClaimInvite.updateMany);
    expect(revokeArgs.where).toEqual({ id, workshopId, status: 'claimed' });
    expect(revokeArgs.data.status).toBe('revoked');
  });

  it('claimed/already_owner → NO toca el ownership', async () => {
    prisma.vehicleClaimInvite.findFirst.mockResolvedValue(
      invite({ status: 'claimed', claimOutcome: 'already_owner' }),
    );

    const result = await handler.execute(command());

    expect(result.data.ownershipUndone).toBe(false);
    expect(prisma.vehicleOwnership.updateMany).not.toHaveBeenCalled();
  });

  it('ownership ya cerrado (count 0) → ownershipUndone false', async () => {
    prisma.vehicleClaimInvite.findFirst.mockResolvedValue(
      invite({ status: 'claimed', claimOutcome: 'ownership_created' }),
    );
    prisma.vehicleOwnership.updateMany.mockResolvedValue({ count: 0 });

    const result = await handler.execute(command());

    expect(result.data.ownershipUndone).toBe(false);
  });
  it('otra pestaña cambió el estado → 409', async () => {
    prisma.vehicleClaimInvite.findFirst.mockResolvedValue(invite());
    prisma.vehicleClaimInvite.updateMany.mockResolvedValue({ count: 0 });

    const error = await capture(handler.execute(command()));

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as Error).message).toBe(CLAIM_UNAVAILABLE_MESSAGE);
  });

  describe('contexto admin (C-6 / F-8)', () => {
    function adminCommand(): RevokeClaimCommand {
      return new RevokeClaimCommand(
        id,
        { type: 'admin' },
        userId,
        'motivo libre',
      );
    }

    it('sin scope de taller → findFirst solo por id; si no existe → 404', async () => {
      prisma.vehicleClaimInvite.findFirst.mockResolvedValue(null);

      const error = await capture(handler.execute(adminCommand()));

      expect(error).toBeInstanceOf(NotFoundException);
      expect((error as Error).message).toBe(CLAIM_NOT_FOUND_MESSAGE);
      const findArgs = firstArg<{ where: Record<string, string> }>(
        prisma.vehicleClaimInvite.findFirst,
      );
      expect(findArgs.where).toEqual({ id });
    });

    it('pending → revokeReason by_admin, sin scope y evento by_admin', async () => {
      prisma.vehicleClaimInvite.findFirst.mockResolvedValue(invite());

      const result = await handler.execute(adminCommand());

      expect(result).toEqual({
        data: {
          status: 'revoked',
          reason: 'by_admin',
          ownershipUndone: false,
        },
      });
      const findArgs = firstArg<{ where: Record<string, string> }>(
        prisma.vehicleClaimInvite.findFirst,
      );
      expect(findArgs.where).toEqual({ id });

      const revokeArgs = firstArg<{
        where: { id: string; workshopId: string; status: string };
        data: {
          status: string;
          revokedAt: Date;
          revokeReason: string;
          revokedByUserId: string;
        };
      }>(prisma.vehicleClaimInvite.updateMany);
      // El guard de carrera conserva el taller del invite (fila), no un scope.
      expect(revokeArgs.where).toEqual({ id, workshopId, status: 'pending' });
      expect(revokeArgs.data.revokeReason).toBe('by_admin');
      expect(revokeArgs.data.revokedByUserId).toBe(userId);
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'vehicle-claim.revoked',
        expect.objectContaining({ inviteId: id, reason: 'by_admin' }),
      );
    });

    it('manual_review → 409 y no revoca (paridad con el revoke del taller)', async () => {
      prisma.vehicleClaimInvite.findFirst.mockResolvedValue(
        invite({ status: 'manual_review' }),
      );

      const error = await capture(handler.execute(adminCommand()));

      expect(error).toBeInstanceOf(ConflictException);
      expect((error as Error).message).toBe(CLAIM_MANUAL_REVIEW_REJECT_MESSAGE);
      expect(prisma.vehicleClaimInvite.updateMany).not.toHaveBeenCalled();
      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });

    it('claimed/ownership_created → cierra el ownership y ownershipUndone true', async () => {
      prisma.vehicleClaimInvite.findFirst.mockResolvedValue(
        invite({ status: 'claimed', claimOutcome: 'ownership_created' }),
      );

      const result = await handler.execute(adminCommand());

      expect(result.data).toEqual({
        status: 'revoked',
        reason: 'by_admin',
        ownershipUndone: true,
      });
      expect(prisma.vehicleOwnership.updateMany).toHaveBeenCalledTimes(1);
      const ownershipArgs = firstArg<{
        where: { acquiredByClaimInviteId: string; endsAt: null };
        data: { endsAt: Date };
      }>(prisma.vehicleOwnership.updateMany);
      expect(ownershipArgs.where).toEqual({
        acquiredByClaimInviteId: id,
        endsAt: null,
      });
    });
  });
});
