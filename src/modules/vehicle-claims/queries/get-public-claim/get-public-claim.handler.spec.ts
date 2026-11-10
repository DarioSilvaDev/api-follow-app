import { NotFoundException } from '@nestjs/common';
import { CLAIM_LINK_INVALID_MESSAGE } from '../../claim-messages';
import { ClaimInviteSnapshot } from '../../services/claim-state.service';
import { GetPublicClaimHandler } from './get-public-claim.handler';

describe('GetPublicClaimHandler — AC-3 / T2', () => {
  let handler: GetPublicClaimHandler;
  let prisma: { vehicleClaimInvite: { updateMany: jest.Mock } };
  let state: { loadByToken: jest.Mock };

  const now = new Date('2026-11-04T12:00:00.000Z');

  function invite(
    overrides: Partial<ClaimInviteSnapshot> = {},
  ): ClaimInviteSnapshot {
    return {
      id: 'invite-1',
      vehicleId: 'vehicle-1',
      workshopId: 'workshop-1',
      careEpisodeId: 'episode-1',
      status: 'pending',
      expiresAt: new Date(now.getTime() + 7 * 24 * 3600 * 1000),
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
      mileageIn: 45_000,
      ...overrides,
    };
  }

  beforeEach(() => {
    prisma = {
      vehicleClaimInvite: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    state = { loadByToken: jest.fn() };
    handler = new GetPublicClaimHandler(prisma as never, state as never);
  });

  it('404 con el mensaje exacto si el token no existe', async () => {
    state.loadByToken.mockResolvedValue(null);

    await expect(handler.execute('token')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(handler.execute('token')).rejects.toThrow(
      CLAIM_LINK_INVALID_MESSAGE,
    );
  });

  it('T2: pending pasa a verification_required y setea openedAt', async () => {
    state.loadByToken.mockResolvedValue(invite());

    const result = await handler.execute('token');

    expect(prisma.vehicleClaimInvite.updateMany).toHaveBeenCalledWith({
      where: { id: 'invite-1', status: 'pending' },
      data: {
        status: 'verification_required',
        openedAt: expect.any(Date),
      },
    });
    expect(result).toEqual({
      data: { status: 'verification_required', canVerify: true },
    });
  });

  it('no reabre un invite ya verification_required ni pierde openedAt', async () => {
    state.loadByToken.mockResolvedValue(
      invite({ status: 'verification_required', openedAt: now }),
    );

    const result = await handler.execute('token');

    expect(prisma.vehicleClaimInvite.updateMany).not.toHaveBeenCalled();
    expect(result.data).toEqual({
      status: 'verification_required',
      canVerify: true,
    });
  });

  it('contrato AC-3: el body tiene EXACTAMENTE status y canVerify', async () => {
    state.loadByToken.mockResolvedValue(invite());

    const result = await handler.execute('token');

    expect(Object.keys(result.data).sort()).toEqual(['canVerify', 'status']);
    const serialized = JSON.stringify(result);
    for (const forbidden of [
      'licensePlate',
      'vehicle',
      'workshop',
      'mileage',
      'brand',
      'model',
      'phone',
      'vin',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it.each(['verified', 'manual_review'] as const)(
    '%s sigue habilitado para re-verificar (reemitir ticket)',
    async (status) => {
      state.loadByToken.mockResolvedValue(invite({ status }));
      const result = await handler.execute('token');
      expect(result.data).toEqual({ status, canVerify: true });
    },
  );

  it.each(['expired', 'revoked', 'claimed', 'claim_blocked'] as const)(
    '%s no habilita verificación y no expone datos',
    async (status) => {
      state.loadByToken.mockResolvedValue(invite({ status }));
      const result = await handler.execute('token');
      expect(result.data).toEqual({ status, canVerify: false });
    },
  );
});
