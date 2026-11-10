import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  CLAIM_LINK_INVALID_MESSAGE,
  CLAIM_LOCKED_MESSAGE,
  CLAIM_VERIFY_FAILED_MESSAGE,
} from '../../claim-messages';
import { VerifyClaimCommand } from './verify-claim.command';
import { VerifyClaimHandler } from './verify-claim.handler';
import {
  ClaimChallengeService,
  CLAIM_RANGE_WIDTH_KM,
} from '../../services/claim-challenge.service';
import { ClaimInviteSnapshot } from '../../services/claim-state.service';
import { CLAIM_TICKET_TTL_SECONDS } from '../../services/claim-token.service';

async function capture(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('La promesa debía rechazar y resolvió');
}

describe('VerifyClaimHandler — T3/T4/T5/T6/T19', () => {
  let handler: VerifyClaimHandler;
  let state: {
    loadByToken: jest.Mock;
    assertOpen: jest.Mock;
    assertNotLocked: jest.Mock;
    registerFailure: jest.Mock;
    markVerified: jest.Mock;
    markManualReview: jest.Mock;
  };
  let challenge: ClaimChallengeService;
  let tokenService: { signTicket: jest.Mock };
  let eventEmitter: { emit: jest.Mock };

  const inviteId = '11111111-1111-1111-1111-111111111111';
  const vehicleId = '22222222-2222-2222-2222-222222222222';
  const workshopId = '33333333-3333-3333-3333-333333333333';

  function invite(
    overrides: Partial<ClaimInviteSnapshot> = {},
  ): ClaimInviteSnapshot {
    return {
      id: inviteId,
      vehicleId,
      workshopId,
      careEpisodeId: 'episode-1',
      status: 'verification_required',
      expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
      openedAt: null,
      verifiedAt: null,
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
      mileageIn: 45_123,
      ...overrides,
    };
  }

  function command(
    dto: Partial<VerifyClaimCommand['dto']> = {},
  ): VerifyClaimCommand {
    return new VerifyClaimCommand(
      'token',
      { licensePlate: 'AB123CD', ...dto } as VerifyClaimCommand['dto'],
      '1.2.3.0',
      'jest',
    );
  }

  beforeEach(() => {
    state = {
      loadByToken: jest.fn(),
      assertOpen: jest.fn(),
      assertNotLocked: jest.fn(),
      registerFailure: jest.fn().mockResolvedValue({
        status: 'verification_required',
        locked: false,
        autoRevoked: false,
        failedAttempts: 1,
      }),
      markVerified: jest.fn().mockResolvedValue(undefined),
      markManualReview: jest.fn().mockResolvedValue(undefined),
    };
    challenge = new ClaimChallengeService();
    tokenService = { signTicket: jest.fn().mockReturnValue('ticket-jwt') };
    eventEmitter = { emit: jest.fn() };

    handler = new VerifyClaimHandler(
      state as never,
      challenge,
      tokenService as never,
      eventEmitter as unknown as EventEmitter2,
    );
  });

  it('404 con el mensaje exacto si el token no existe', async () => {
    state.loadByToken.mockResolvedValue(null);

    const error = await capture(handler.execute(command()));

    expect(error).toBeInstanceOf(NotFoundException);
    expect((error as Error).message).toBe(CLAIM_LINK_INVALID_MESSAGE);
    expect(state.assertOpen).not.toHaveBeenCalled();
  });

  it('propaga las guardas de estado (terminal) antes de evaluar el body', async () => {
    state.loadByToken.mockResolvedValue(invite({ status: 'claimed' }));
    state.assertOpen.mockImplementation(() => {
      throw new ConflictException('El reclamo ya no está disponible.');
    });

    const error = await capture(handler.execute(command()));

    expect(error).toBeInstanceOf(ConflictException);
    expect(state.registerFailure).not.toHaveBeenCalled();
  });

  it('lock activo → 409 de lock sin registrar un fallo nuevo', async () => {
    state.loadByToken.mockResolvedValue(invite());
    state.assertNotLocked.mockImplementation(() => {
      throw new ConflictException(CLAIM_LOCKED_MESSAGE);
    });

    const error = await capture(handler.execute(command()));

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as Error).message).toBe(CLAIM_LOCKED_MESSAGE);
    expect(state.registerFailure).not.toHaveBeenCalled();
  });

  describe('anti-enumeración: los 4 fallos son byte-idénticos (§6.6)', () => {
    async function failureResponse(
      build: () => VerifyClaimCommand,
      inviteOverrides: Partial<ClaimInviteSnapshot> = {},
    ): Promise<string> {
      state.loadByToken.mockResolvedValue(invite(inviteOverrides));
      const error = await capture(handler.execute(build()));
      expect(error).toBeInstanceOf(BadRequestException);
      return JSON.stringify((error as BadRequestException).getResponse());
    }

    it('patente ajena, VIN incorrecto, rango incorrecto y factor faltante devuelven lo mismo', async () => {
      const wrongPlate = await failureResponse(() =>
        command({ licensePlate: 'ZZ999ZZ' }),
      );
      const wrongVin = await failureResponse(() =>
        command({ vinLast4: '0000' }),
      );
      const wrongRange = await failureResponse(
        () => command({ mileageRangeId: 'r999' }),
        { vehicle: { ...invite().vehicle, vin: null } },
      );
      const missingFactor = await failureResponse(() => command());

      expect(wrongVin).toBe(wrongPlate);
      expect(wrongRange).toBe(wrongPlate);
      expect(missingFactor).toBe(wrongPlate);

      const parsed = JSON.parse(wrongPlate) as { message: string };
      expect(parsed.message).toBe(CLAIM_VERIFY_FAILED_MESSAGE);
    });

    it('cada fallo registra intento y emite verify-failed con el contador', async () => {
      state.loadByToken.mockResolvedValue(invite());
      state.registerFailure.mockResolvedValue({
        status: 'verification_required',
        locked: false,
        autoRevoked: false,
        failedAttempts: 3,
      });

      await capture(handler.execute(command({ vinLast4: '0000' })));

      expect(state.registerFailure).toHaveBeenCalledWith(
        expect.objectContaining({ id: inviteId }),
        {
          ip: '1.2.3.0',
          userAgent: 'jest',
          plateInput: 'AB123CD',
        },
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'vehicle-claim.verify-failed',
        expect.objectContaining({
          inviteId,
          vehicleId,
          workshopId,
          failedAttempts: 3,
          locked: false,
          autoRevoked: false,
        }),
      );
    });

    it('el tercer lockout emite revoked además de verify-failed', async () => {
      state.loadByToken.mockResolvedValue(invite());
      state.registerFailure.mockResolvedValue({
        status: 'revoked',
        locked: false,
        autoRevoked: true,
        failedAttempts: 5,
      });

      await capture(handler.execute(command({ vinLast4: '0000' })));

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'vehicle-claim.revoked',
        expect.objectContaining({
          inviteId,
          vehicleId,
          workshopId,
          reason: 'max_attempts',
          autoRevoked: true,
        }),
      );
    });
  });

  describe('precedencia de factores (F-2)', () => {
    it('con VIN ignora por completo mileageRangeId', async () => {
      state.loadByToken.mockResolvedValue(invite());
      const verifyRange = jest.spyOn(challenge, 'verifyRange');

      const result = await handler.execute(
        command({ vinLast4: '4567', mileageRangeId: 'unknown' }),
      );

      expect(verifyRange).not.toHaveBeenCalled();
      expect(result).toEqual({
        data: {
          status: 'verified',
          ticket: 'ticket-jwt',
          expiresIn: CLAIM_TICKET_TTL_SECONDS,
        },
      });
    });

    it('compara los últimos 4 del VIN normalizando espacios y minúsculas', async () => {
      state.loadByToken.mockResolvedValue(invite());

      const result = await handler.execute(command({ vinLast4: ' 4567 ' }));

      expect(result.data).toMatchObject({ status: 'verified' });
    });

    it('sin VIN usa el rango de odómetro y acepta el correcto', async () => {
      const mileageIn = 45_123;
      state.loadByToken.mockResolvedValue(
        invite({
          vehicle: { ...invite().vehicle, vin: null },
          mileageIn,
        }),
      );
      const built = challenge.build(inviteId, mileageIn);
      const validId = built.options
        .filter((o) => o.id !== 'unknown')
        .find(
          (o) => challenge.verifyRange(inviteId, mileageIn, o.id) === 'valid',
        )?.id;
      expect(validId).toBeDefined();

      const result = await handler.execute(
        command({ mileageRangeId: validId }),
      );

      expect(result).toEqual({
        data: {
          status: 'verified',
          ticket: 'ticket-jwt',
          expiresIn: CLAIM_TICKET_TTL_SECONDS,
        },
      });
      expect(state.markVerified).toHaveBeenCalledWith(
        expect.objectContaining({ id: inviteId }),
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'vehicle-claim.verified',
        expect.objectContaining({ inviteId, vehicleId, workshopId }),
      );
      expect(
        Math.floor(mileageIn / CLAIM_RANGE_WIDTH_KM) * CLAIM_RANGE_WIDTH_KM,
      ).toBe(45_000);
    });

    it('"No lo sé" deriva a manual_review sin gastar intento', async () => {
      state.loadByToken.mockResolvedValue(
        invite({ vehicle: { ...invite().vehicle, vin: null } }),
      );

      const result = await handler.execute(
        command({ mileageRangeId: 'unknown' }),
      );

      expect(result).toEqual({
        data: { status: 'manual_review', ticket: 'ticket-jwt' },
      });
      expect(state.markManualReview).toHaveBeenCalledWith(
        expect.objectContaining({ id: inviteId }),
      );
      expect(state.registerFailure).not.toHaveBeenCalled();
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'vehicle-claim.manual-review',
        expect.objectContaining({ inviteId, vehicleId, workshopId }),
      );
    });

    it('sin VIN y sin odómetro la patente sola nunca verifica (AC-25)', async () => {
      state.loadByToken.mockResolvedValue(
        invite({
          vehicle: { ...invite().vehicle, vin: null },
          mileageIn: null,
        }),
      );

      const result = await handler.execute(command());

      expect(result).toEqual({
        data: { status: 'manual_review', ticket: 'ticket-jwt' },
      });
      expect(state.markVerified).not.toHaveBeenCalled();
      expect(state.registerFailure).not.toHaveBeenCalled();
    });

    it('sin VIN y sin odómetro una patente distinta sí falla', async () => {
      state.loadByToken.mockResolvedValue(
        invite({
          vehicle: { ...invite().vehicle, vin: null },
          mileageIn: null,
        }),
      );

      const error = await capture(
        handler.execute(command({ licensePlate: 'ZZ999ZZ' })),
      );

      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as Error).message).toBe(CLAIM_VERIFY_FAILED_MESSAGE);
      expect(state.registerFailure).toHaveBeenCalledTimes(1);
    });
  });

  it('el verify exitoso no pasa por la transición de revisión manual', async () => {
    state.loadByToken.mockResolvedValue(invite());

    await handler.execute(command({ vinLast4: '4567' }));

    expect(state.markManualReview).not.toHaveBeenCalled();
    expect(state.registerFailure).not.toHaveBeenCalled();
  });
});
