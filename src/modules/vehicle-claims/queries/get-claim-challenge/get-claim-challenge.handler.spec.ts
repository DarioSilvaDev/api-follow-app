import { BadRequestException, GoneException } from '@nestjs/common';
import {
  CLAIM_LINK_INVALID_MESSAGE,
  CLAIM_VERIFY_FAILED_MESSAGE,
} from '../../claim-messages';
import { ClaimChallengeService } from '../../services/claim-challenge.service';
import { ClaimInviteSnapshot } from '../../services/claim-state.service';
import { GetClaimChallengeHandler } from './get-claim-challenge.handler';

describe('GetClaimChallengeHandler — plate-gated + F-2/F-3', () => {
  let handler: GetClaimChallengeHandler;
  let state: {
    loadByToken: jest.Mock;
    assertOpen: jest.Mock;
    assertNotLocked: jest.Mock;
  };
  const challenge = new ClaimChallengeService();

  function invite(
    overrides: Partial<ClaimInviteSnapshot> = {},
  ): ClaimInviteSnapshot {
    return {
      id: 'invite-1',
      vehicleId: 'vehicle-1',
      workshopId: 'workshop-1',
      careEpisodeId: 'episode-1',
      status: 'verification_required',
      expiresAt: new Date(Date.now() + 1000),
      openedAt: null,
      verifiedAt: null,
      failedAttempts: 0,
      lastFailedAt: null,
      verificationLockedAt: null,
      lockoutCount: 0,
      usedAt: null,
      claimantUserId: null,
      vehicle: {
        id: 'vehicle-1',
        licensePlate: 'AB123CD',
        vin: '8AJHA9CD0P1234567',
        deletedAt: null,
      },
      mileageIn: 45_123,
      ...overrides,
    };
  }

  beforeEach(() => {
    state = {
      loadByToken: jest.fn(),
      assertOpen: jest.fn(),
      assertNotLocked: jest.fn(),
    };
    handler = new GetClaimChallengeHandler(state as never, challenge);
  });

  it('404 con el mensaje exacto si el token no existe', async () => {
    state.loadByToken.mockResolvedValue(null);
    await expect(handler.execute('token', 'AB123CD')).rejects.toThrow(
      CLAIM_LINK_INVALID_MESSAGE,
    );
  });

  it('aplica las guardas de estado antes de comparar la patente', async () => {
    state.loadByToken.mockResolvedValue(invite());
    state.assertOpen.mockImplementation(() => {
      throw new GoneException('vencido');
    });

    await expect(handler.execute('token', 'AB123CD')).rejects.toBeInstanceOf(
      GoneException,
    );
    expect(state.assertNotLocked).not.toHaveBeenCalled();
  });

  it.each([undefined, '', 'XX999XX'])(
    'patente ausente o distinta (%p) → 400 único',
    async (plate) => {
      state.loadByToken.mockResolvedValue(invite());

      let error: unknown;
      try {
        await handler.execute('token', plate);
      } catch (caught) {
        error = caught;
      }

      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as Error).message).toBe(CLAIM_VERIFY_FAILED_MESSAGE);
    },
  );

  it('normaliza la patente (trim + mayúsculas)', async () => {
    state.loadByToken.mockResolvedValue(invite());
    const result = await handler.execute('token', ' ab123cd ');
    expect(result.data.factor).toBe('vin');
  });

  it('con VIN el factor es vin y no se emiten opciones (F-2)', async () => {
    state.loadByToken.mockResolvedValue(invite());
    const result = await handler.execute('token', 'AB123CD');
    expect(result).toEqual({ data: { factor: 'vin', options: [] } });
  });

  it('sin VIN el factor es mileage con 4-6 rangos + "No lo sé" (F-3)', async () => {
    state.loadByToken.mockResolvedValue(
      invite({ vehicle: { ...invite().vehicle, vin: null } }),
    );
    const result = await handler.execute('token', 'AB123CD');

    expect(result.data.factor).toBe('mileage');
    const ranges = result.data.options.filter((o) => o.id !== 'unknown');
    expect(ranges.length).toBeGreaterThanOrEqual(4);
    expect(ranges.length).toBeLessThanOrEqual(6);
    expect(result.data.options.at(-1)?.label).toBe('No lo sé');
  });

  it('sin VIN y sin odómetro el factor es manual_review', async () => {
    state.loadByToken.mockResolvedValue(
      invite({
        vehicle: { ...invite().vehicle, vin: null },
        mileageIn: null,
      }),
    );
    const result = await handler.execute('token', 'AB123CD');
    expect(result).toEqual({ data: { factor: 'manual_review', options: [] } });
  });
});
