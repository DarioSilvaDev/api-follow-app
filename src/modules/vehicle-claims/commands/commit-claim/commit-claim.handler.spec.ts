import {
  ConflictException,
  GoneException,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import {
  AuthRequiredException,
  TicketExpiredException,
} from '../../../../common/exceptions/coded.exception';
import {
  CLAIM_BLOCKED_MESSAGE,
  CLAIM_EXPIRED_MESSAGE,
  CLAIM_LINK_INVALID_MESSAGE,
  CLAIM_REVOKED_MESSAGE,
  CLAIM_UNAVAILABLE_MESSAGE,
} from '../../claim-messages';
import { ClaimStateService } from '../../services/claim-state.service';
import { ClaimTokenService } from '../../services/claim-token.service';
import { CommitClaimCommand } from './commit-claim.command';
import { CommitClaimHandler } from './commit-claim.handler';

async function capture(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('La promesa debía rechazar y resolvió');
}

describe('CommitClaimHandler — T7/T8/T9/T10/T20', () => {
  let handler: CommitClaimHandler;
  let prisma: {
    vehicleClaimInvite: { updateMany: jest.Mock };
    vehicleClaimAttempt: { create: jest.Mock };
    vehicleOwnership: { findFirst: jest.Mock; create: jest.Mock };
    $transaction: jest.Mock;
  };
  let state: ClaimStateService;
  let tokenService: { verifyTicket: jest.Mock };
  let eventEmitter: { emit: jest.Mock };

  const inviteId = '11111111-1111-1111-1111-111111111111';
  const vehicleId = '22222222-2222-2222-2222-222222222222';
  const workshopId = '33333333-3333-3333-3333-333333333333';
  const sessionUserId = '44444444-4444-4444-4444-444444444444';
  const ticket = 'ticket-jwt';

  function invite(
    overrides: Partial<{
      status: string;
      claimantUserId: string | null;
      usedAt: Date | null;
    }> = {},
  ) {
    return {
      id: inviteId,
      vehicleId,
      workshopId,
      careEpisodeId: 'episode-1',
      status: 'verified',
      expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
      openedAt: null,
      verifiedAt: new Date(),
      failedAttempts: 0,
      lastFailedAt: null,
      verificationLockedAt: null,
      lockoutCount: 0,
      usedAt: null,
      claimantUserId: null,
      vehicle: {
        id: vehicleId,
        licensePlate: 'AB123CD',
        vin: '8AJHA9CD0P1234567',
        deletedAt: null,
      },
      mileageIn: 45_000,
      ...overrides,
    };
  }

  function command(
    overrides: Partial<{ token: string; sessionUserId: string | null }> = {},
  ): CommitClaimCommand {
    return new CommitClaimCommand(
      overrides.token ?? 'token',
      { ticket },
      overrides.sessionUserId === undefined
        ? sessionUserId
        : overrides.sessionUserId,
    );
  }

  beforeEach(() => {
    prisma = {
      vehicleClaimInvite: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      vehicleClaimAttempt: { create: jest.fn().mockResolvedValue({}) },
      vehicleOwnership: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
      },
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation(
      async (callback: (tx: unknown) => Promise<unknown>) => callback(prisma),
    );

    tokenService = {
      verifyTicket: jest
        .fn()
        .mockReturnValue({ inviteId, vehicleId, purpose: 'claim' }),
    };
    eventEmitter = { emit: jest.fn() };

    state = new ClaimStateService(
      prisma as never,
      tokenService as never,
      eventEmitter as unknown as EventEmitter2,
    );
    jest.spyOn(state, 'loadByToken');

    handler = new CommitClaimHandler(
      prisma as never,
      state,
      tokenService as unknown as ClaimTokenService,
      eventEmitter as unknown as EventEmitter2,
    );
  });

  describe('guardas de orden (404 → 401 → terminal → ticket)', () => {
    it('404 con el mensaje exacto si el token no existe', async () => {
      jest.spyOn(state, 'loadByToken').mockResolvedValue(null);

      const error = await capture(handler.execute(command()));

      expect(error).toBeInstanceOf(NotFoundException);
      expect((error as Error).message).toBe(CLAIM_LINK_INVALID_MESSAGE);
    });

    it('sin sesión responde 401 AUTH_REQUIRED antes de evaluar el estado', async () => {
      jest
        .spyOn(state, 'loadByToken')
        .mockResolvedValue(invite({ status: 'claimed' }) as never);

      const error = await capture(
        handler.execute(command({ sessionUserId: null })),
      );

      expect(error).toBeInstanceOf(AuthRequiredException);
      expect((error as AuthRequiredException).getResponse()).toMatchObject({
        statusCode: 401,
        code: 'AUTH_REQUIRED',
      });
      expect(prisma.vehicleClaimInvite.updateMany).not.toHaveBeenCalled();
    });

    it('expired → 410 con el copy de vencido', async () => {
      jest
        .spyOn(state, 'loadByToken')
        .mockResolvedValue(invite({ status: 'expired' }) as never);

      const error = await capture(handler.execute(command()));

      expect(error).toBeInstanceOf(GoneException);
      expect((error as Error).message).toBe(CLAIM_EXPIRED_MESSAGE);
    });

    it('revoked → 410 con el copy de revocado', async () => {
      jest
        .spyOn(state, 'loadByToken')
        .mockResolvedValue(invite({ status: 'revoked' }) as never);

      const error = await capture(handler.execute(command()));

      expect(error).toBeInstanceOf(GoneException);
      expect((error as Error).message).toBe(CLAIM_REVOKED_MESSAGE);
    });

    it.each(['claimed', 'claim_blocked'] as const)(
      '%s → 409 genérico sin datos',
      async (status) => {
        jest
          .spyOn(state, 'loadByToken')
          .mockResolvedValue(invite({ status }) as never);

        const error = await capture(handler.execute(command()));

        expect(error).toBeInstanceOf(ConflictException);
        expect((error as Error).message).toBe(CLAIM_UNAVAILABLE_MESSAGE);
      },
    );
  });

  describe('ticket (T20)', () => {
    it('ticket vencido → 401 TICKET_EXPIRED y vuelve a verification_required', async () => {
      jest.spyOn(state, 'loadByToken').mockResolvedValue(invite() as never);
      tokenService.verifyTicket.mockImplementation(() => {
        throw new TicketExpiredException();
      });

      const error = await capture(handler.execute(command()));

      expect(error).toBeInstanceOf(TicketExpiredException);
      expect((error as TicketExpiredException).getResponse()).toMatchObject({
        statusCode: 401,
        code: 'TICKET_EXPIRED',
      });
      expect(prisma.vehicleClaimInvite.updateMany).toHaveBeenCalledWith({
        where: { id: inviteId, status: 'verified' },
        data: { status: 'verification_required', verifiedAt: null },
      });
      expect(prisma.vehicleOwnership.create).not.toHaveBeenCalled();
    });

    it('ticket de otro invite → 401 TICKET_EXPIRED y reset', async () => {
      jest.spyOn(state, 'loadByToken').mockResolvedValue(invite() as never);
      tokenService.verifyTicket.mockReturnValue({
        inviteId: 'otro-invite',
        vehicleId,
        purpose: 'claim',
      });

      const error = await capture(handler.execute(command()));

      expect(error).toBeInstanceOf(TicketExpiredException);
      expect(prisma.vehicleClaimInvite.updateMany).toHaveBeenCalledWith({
        where: { id: inviteId, status: 'verified' },
        data: { status: 'verification_required', verifiedAt: null },
      });
    });

    it('ticket de otro vehículo → 401 TICKET_EXPIRED y reset', async () => {
      jest.spyOn(state, 'loadByToken').mockResolvedValue(invite() as never);
      tokenService.verifyTicket.mockReturnValue({
        inviteId,
        vehicleId: 'otro-vehiculo',
        purpose: 'claim',
      });

      const error = await capture(handler.execute(command()));

      expect(error).toBeInstanceOf(TicketExpiredException);
      expect(prisma.vehicleOwnership.create).not.toHaveBeenCalled();
    });

    it('ticket válido sobre un invite que ya no está verified → TICKET_EXPIRED sin tocar la BD', async () => {
      jest
        .spyOn(state, 'loadByToken')
        .mockResolvedValue(
          invite({ status: 'verification_required' }) as never,
        );

      const error = await capture(handler.execute(command()));

      expect(error).toBeInstanceOf(TicketExpiredException);
      expect(prisma.vehicleClaimInvite.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('commit exitoso (T7/T8)', () => {
    it('crea el ownership, marca usedAt y devuelve ownership_created', async () => {
      jest.spyOn(state, 'loadByToken').mockResolvedValue(invite() as never);

      const result = await handler.execute(command());

      expect(result).toEqual({
        data: { status: 'claimed', outcome: 'ownership_created' },
      });
      expect(prisma.vehicleClaimInvite.updateMany).toHaveBeenCalledWith({
        where: { id: inviteId, status: 'verified' },
        data: {
          status: 'claimed',
          usedAt: expect.any(Date),
          claimOutcome: 'ownership_created',
          claimantUserId: sessionUserId,
        },
      });
      expect(prisma.vehicleOwnership.create).toHaveBeenCalledWith({
        data: {
          vehicleId,
          userId: sessionUserId,
          type: 'owner',
          startsAt: expect.any(Date),
          endsAt: null,
          acquiredByClaimInviteId: inviteId,
        },
      });
      expect(prisma.vehicleClaimAttempt.create).toHaveBeenCalledWith({
        data: { inviteId, outcome: 'claim_success' },
      });
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'vehicle-claim.claimed',
        expect.objectContaining({
          inviteId,
          vehicleId,
          workshopId,
          claimantUserId: sessionUserId,
          outcome: 'ownership_created',
        }),
      );
    });

    it('el segundo commit (updateMany sin filas) → 409 y no crea ownership', async () => {
      jest.spyOn(state, 'loadByToken').mockResolvedValue(invite() as never);
      prisma.vehicleClaimInvite.updateMany.mockResolvedValue({ count: 0 });

      const error = await capture(handler.execute(command()));

      expect(error).toBeInstanceOf(ConflictException);
      expect((error as Error).message).toBe(CLAIM_UNAVAILABLE_MESSAGE);
      expect(prisma.vehicleOwnership.create).not.toHaveBeenCalled();
    });
  });

  describe('titularidad existente (T9)', () => {
    it('la sesión ya es titular → already_owner sin crear ownership', async () => {
      jest.spyOn(state, 'loadByToken').mockResolvedValue(invite() as never);
      prisma.vehicleOwnership.findFirst.mockResolvedValue({
        id: 'ownership-1',
        userId: sessionUserId,
        type: 'owner',
      });

      const result = await handler.execute(command());

      expect(result).toEqual({
        data: { status: 'claimed', outcome: 'already_owner' },
      });
      expect(prisma.vehicleOwnership.create).not.toHaveBeenCalled();
      expect(prisma.vehicleClaimInvite.updateMany).toHaveBeenCalledWith({
        where: { id: inviteId, status: 'verified' },
        data: {
          status: 'claimed',
          usedAt: expect.any(Date),
          claimOutcome: 'already_owner',
          claimantUserId: sessionUserId,
        },
      });
      expect(prisma.vehicleClaimAttempt.create).toHaveBeenCalledWith({
        data: { inviteId, outcome: 'claim_already_owner' },
      });
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'vehicle-claim.claimed',
        expect.objectContaining({ outcome: 'already_owner' }),
      );
    });

    it('otro titular activo → claim_blocked sin tocar el ownership existente', async () => {
      jest.spyOn(state, 'loadByToken').mockResolvedValue(invite() as never);
      prisma.vehicleOwnership.findFirst.mockResolvedValue({
        id: 'ownership-1',
        userId: 'otro-user',
        type: 'owner',
      });

      const error = await capture(handler.execute(command()));

      expect(error).toBeInstanceOf(ConflictException);
      expect((error as Error).message).toBe(CLAIM_BLOCKED_MESSAGE);
      expect(prisma.vehicleOwnership.create).not.toHaveBeenCalled();
      expect(prisma.vehicleClaimInvite.updateMany).toHaveBeenCalledWith({
        where: { id: inviteId, status: 'verified' },
        data: {
          status: 'claim_blocked',
          blockedAt: expect.any(Date),
          claimantUserId: sessionUserId,
        },
      });
      expect(prisma.vehicleClaimAttempt.create).toHaveBeenCalledWith({
        data: { inviteId, outcome: 'claim_blocked' },
      });
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'vehicle-claim.blocked',
        expect.objectContaining({ inviteId, claimantUserId: sessionUserId }),
      );
    });

    it('una concesionaria (type=company) nunca da already_owner, aunque sea la misma cuenta', async () => {
      jest.spyOn(state, 'loadByToken').mockResolvedValue(invite() as never);
      prisma.vehicleOwnership.findFirst.mockResolvedValue({
        id: 'ownership-1',
        userId: sessionUserId,
        type: 'company',
      });

      const error = await capture(handler.execute(command()));

      expect(error).toBeInstanceOf(ConflictException);
      expect((error as Error).message).toBe(CLAIM_BLOCKED_MESSAGE);
      expect(prisma.vehicleOwnership.create).not.toHaveBeenCalled();
    });

    it('P2002 del índice primario → claim_blocked en transacción aparte', async () => {
      jest.spyOn(state, 'loadByToken').mockResolvedValue(invite() as never);
      const p2002 = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed on the fields: (`vehicle_id`)',
        { code: 'P2002', clientVersion: '6.19.3' },
      );
      prisma.$transaction
        .mockRejectedValueOnce(p2002)
        .mockImplementation(
          async (callback: (tx: unknown) => Promise<unknown>) =>
            callback(prisma),
        );

      const error = await capture(handler.execute(command()));

      expect(error).toBeInstanceOf(ConflictException);
      expect((error as Error).message).toBe(CLAIM_BLOCKED_MESSAGE);
      expect(prisma.vehicleClaimInvite.updateMany).toHaveBeenCalledWith({
        where: { id: inviteId, status: 'verified' },
        data: {
          status: 'claim_blocked',
          blockedAt: expect.any(Date),
          claimantUserId: sessionUserId,
        },
      });
      expect(prisma.vehicleClaimAttempt.create).toHaveBeenCalledWith({
        data: { inviteId, outcome: 'claim_blocked' },
      });
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'vehicle-claim.blocked',
        expect.objectContaining({ inviteId, claimantUserId: sessionUserId }),
      );
    });
  });

  describe('manual_review (T10)', () => {
    it('vincula claimantUserId y no consume el single-use', async () => {
      jest
        .spyOn(state, 'loadByToken')
        .mockResolvedValue(invite({ status: 'manual_review' }) as never);

      const result = await handler.execute(command());

      expect(result).toEqual({ data: { status: 'manual_review' } });
      const call = prisma.vehicleClaimInvite.updateMany.mock.calls[0][0];
      expect(call).toEqual({
        where: { id: inviteId, status: 'manual_review' },
        data: { claimantUserId: sessionUserId },
      });
      expect(call.data).not.toHaveProperty('usedAt');
      expect(prisma.vehicleOwnership.create).not.toHaveBeenCalled();
    });

    it('si el invite ya está vinculado a otra cuenta → 409 sin sobrescribir', async () => {
      jest.spyOn(state, 'loadByToken').mockResolvedValue(
        invite({
          status: 'manual_review',
          claimantUserId: 'otro-user',
        }) as never,
      );

      const error = await capture(handler.execute(command()));

      expect(error).toBeInstanceOf(ConflictException);
      expect((error as Error).message).toBe(CLAIM_UNAVAILABLE_MESSAGE);
      expect(prisma.vehicleClaimInvite.updateMany).not.toHaveBeenCalled();
    });

    it('si otra pestaña ya lo movió de estado → 409 genérico', async () => {
      jest
        .spyOn(state, 'loadByToken')
        .mockResolvedValue(invite({ status: 'manual_review' }) as never);
      prisma.vehicleClaimInvite.updateMany.mockResolvedValue({ count: 0 });

      const error = await capture(handler.execute(command()));

      expect(error).toBeInstanceOf(ConflictException);
      expect((error as Error).message).toBe(CLAIM_UNAVAILABLE_MESSAGE);
    });
  });
});
