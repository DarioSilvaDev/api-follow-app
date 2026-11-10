import { ConflictException, GoneException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  CLAIM_LOCK_DURATION_MS,
  CLAIM_LOCK_WINDOW_MS,
  CLAIM_MAX_FAILED_ATTEMPTS,
  CLAIM_MAX_LOCKOUTS,
  ClaimInviteSnapshot,
  ClaimStateService,
} from './claim-state.service';
import {
  CLAIM_EXPIRED_MESSAGE,
  CLAIM_LOCKED_MESSAGE,
  CLAIM_REVOKED_MESSAGE,
  CLAIM_UNAVAILABLE_MESSAGE,
} from '../claim-messages';

describe('ClaimStateService — T2/T4/T15/T16/T19/T20', () => {
  let service: ClaimStateService;
  let prisma: {
    vehicleClaimInvite: {
      findUnique: jest.Mock;
      updateMany: jest.Mock;
      update: jest.Mock;
    };
    vehicleClaimAttempt: { create: jest.Mock };
    $transaction: jest.Mock;
  };
  let tokenService: { hashToken: jest.Mock };
  let eventEmitter: { emit: jest.Mock };

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
        vin: null,
        deletedAt: null,
      },
      mileageIn: 45_000,
      ...overrides,
    };
  }

  function rawRow(overrides: Record<string, unknown> = {}) {
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
        vin: null,
        deletedAt: null,
        careEpisodes: [{ mileageIn: 45_000 }],
      },
      ...overrides,
    };
  }

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(now);

    prisma = {
      vehicleClaimInvite: {
        findUnique: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn(),
      },
      vehicleClaimAttempt: { create: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation(
      async (callback: (tx: unknown) => Promise<unknown>) => callback(prisma),
    );

    tokenService = { hashToken: jest.fn().mockReturnValue('hash') };
    eventEmitter = { emit: jest.fn() };

    service = new ClaimStateService(
      prisma as never,
      tokenService as never,
      eventEmitter as unknown as EventEmitter2,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('loadByToken', () => {
    it('devuelve null si el hash no existe', async () => {
      prisma.vehicleClaimInvite.findUnique.mockResolvedValue(null);
      await expect(service.loadByToken('token')).resolves.toBeNull();
      expect(tokenService.hashToken).toHaveBeenCalledWith('token');
    });

    it('busca por tokenHash (nunca por token crudo) y arma el snapshot', async () => {
      prisma.vehicleClaimInvite.findUnique.mockResolvedValue(rawRow());
      const result = await service.loadByToken('token');

      expect(prisma.vehicleClaimInvite.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tokenHash: 'hash' } }),
      );
      expect(result?.mileageIn).toBe(45_000);
      expect(result?.vehicle.licensePlate).toBe('AB123CD');
    });

    it('aplica expiración lazy (T15) y devuelve expired', async () => {
      prisma.vehicleClaimInvite.findUnique.mockResolvedValue(
        rawRow({ expiresAt: new Date(now.getTime() - 1) }),
      );

      const result = await service.loadByToken('token');

      expect(prisma.vehicleClaimInvite.updateMany).toHaveBeenCalledWith({
        where: { id: 'invite-1', status: { in: expect.any(Array) } },
        data: { status: 'expired' },
      });
      expect(result?.status).toBe('expired');
    });

    it('no reescribe un invite ya expired', async () => {
      prisma.vehicleClaimInvite.findUnique.mockResolvedValue(
        rawRow({ status: 'expired', expiresAt: new Date(now.getTime() - 1) }),
      );
      const result = await service.loadByToken('token');
      expect(prisma.vehicleClaimInvite.updateMany).not.toHaveBeenCalled();
      expect(result?.status).toBe('expired');
    });

    it('no toca estados terminales', async () => {
      prisma.vehicleClaimInvite.findUnique.mockResolvedValue(
        rawRow({ status: 'claimed', expiresAt: new Date(now.getTime() - 1) }),
      );
      const result = await service.loadByToken('token');
      expect(prisma.vehicleClaimInvite.updateMany).not.toHaveBeenCalled();
      expect(result?.status).toBe('claimed');
    });

    it('T16: revoca un invite abierto si el vehículo fue dado de baja', async () => {
      prisma.vehicleClaimInvite.findUnique.mockResolvedValue(
        rawRow({
          vehicle: {
            id: 'vehicle-1',
            licensePlate: 'AB123CD',
            vin: null,
            deletedAt: new Date(now.getTime() - 1000),
            careEpisodes: [],
          },
        }),
      );

      const result = await service.loadByToken('token');

      expect(prisma.vehicleClaimInvite.updateMany).toHaveBeenCalledWith({
        where: { id: 'invite-1', status: { notIn: expect.any(Array) } },
        data: expect.objectContaining({
          status: 'revoked',
          revokeReason: 'vehicle_deleted',
        }),
      });
      expect(result?.status).toBe('revoked');
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'vehicle-claim.revoked',
        expect.objectContaining({
          inviteId: 'invite-1',
          reason: 'vehicle_deleted',
          autoRevoked: false,
        }),
      );
    });

    it('T16: también revoca un invite `expired` (no-terminal) si el vehículo fue dado de baja', async () => {
      prisma.vehicleClaimInvite.findUnique.mockResolvedValue(
        rawRow({
          status: 'expired',
          expiresAt: new Date(now.getTime() - 1000),
          vehicle: {
            id: 'vehicle-1',
            licensePlate: 'AB123CD',
            vin: null,
            deletedAt: new Date(now.getTime() - 1000),
            careEpisodes: [],
          },
        }),
      );

      const result = await service.loadByToken('token');

      expect(prisma.vehicleClaimInvite.updateMany).toHaveBeenCalledWith({
        where: { id: 'invite-1', status: { notIn: expect.any(Array) } },
        data: expect.objectContaining({
          status: 'revoked',
          revokeReason: 'vehicle_deleted',
        }),
      });
      expect(result?.status).toBe('revoked');
    });

    it('T16: no toca un invite ya terminal aunque el vehículo esté dado de baja', async () => {
      prisma.vehicleClaimInvite.findUnique.mockResolvedValue(
        rawRow({
          status: 'claimed',
          vehicle: {
            id: 'vehicle-1',
            licensePlate: 'AB123CD',
            vin: null,
            deletedAt: new Date(now.getTime() - 1000),
            careEpisodes: [],
          },
        }),
      );

      const result = await service.loadByToken('token');

      expect(prisma.vehicleClaimInvite.updateMany).not.toHaveBeenCalled();
      expect(result?.status).toBe('claimed');
    });
  });

  describe('auto-liberación del lock (T4)', () => {
    it('libera el lock a los 30 min y registra lockout_released', async () => {
      const result = await service.refresh(
        invite({
          status: 'verification_required',
          verificationLockedAt: new Date(
            now.getTime() - CLAIM_LOCK_DURATION_MS - 1,
          ),
          failedAttempts: 5,
          lastFailedAt: new Date(now.getTime() - 1000),
        }),
      );

      expect(prisma.vehicleClaimInvite.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'invite-1',
          verificationLockedAt: expect.any(Date),
        },
        data: {
          failedAttempts: 0,
          lastFailedAt: null,
          verificationLockedAt: null,
        },
      });
      expect(prisma.vehicleClaimAttempt.create).toHaveBeenCalledWith({
        data: { inviteId: 'invite-1', outcome: 'lockout_released' },
      });
      expect(result.verificationLockedAt).toBeNull();
      expect(result.failedAttempts).toBe(0);
    });

    it('no libera el lock antes de los 30 min', async () => {
      const lockedAt = new Date(now.getTime() - CLAIM_LOCK_DURATION_MS + 1000);
      const result = await service.refresh(
        invite({ verificationLockedAt: lockedAt, failedAttempts: 5 }),
      );
      expect(prisma.vehicleClaimInvite.updateMany).not.toHaveBeenCalled();
      expect(result.verificationLockedAt).toBe(lockedAt);
    });
  });

  describe('assertOpen / assertNotLocked', () => {
    it('expired → 410 con copy de vencido', () => {
      expect(() => service.assertOpen(invite({ status: 'expired' }))).toThrow(
        GoneException,
      );
      try {
        service.assertOpen(invite({ status: 'expired' }));
      } catch (error) {
        expect((error as Error).message).toBe(CLAIM_EXPIRED_MESSAGE);
      }
    });

    it('revoked → 410 con copy de revocado', () => {
      try {
        service.assertOpen(invite({ status: 'revoked' }));
      } catch (error) {
        expect((error as Error).message).toBe(CLAIM_REVOKED_MESSAGE);
      }
    });

    it.each(['claimed', 'claim_blocked'] as const)(
      '%s → 409 genérico sin datos',
      (status) => {
        try {
          service.assertOpen(invite({ status }));
        } catch (error) {
          expect(error).toBeInstanceOf(ConflictException);
          expect((error as Error).message).toBe(CLAIM_UNAVAILABLE_MESSAGE);
        }
      },
    );

    it('lock activo → 409 de lock', () => {
      try {
        service.assertNotLocked(
          invite({ verificationLockedAt: new Date(now.getTime() - 1000) }),
        );
      } catch (error) {
        expect(error).toBeInstanceOf(ConflictException);
        expect((error as Error).message).toBe(CLAIM_LOCKED_MESSAGE);
      }
    });
  });

  describe('registerFailure — escalera F-4', () => {
    it('fallo 1..4: incrementa y no bloquea', async () => {
      prisma.vehicleClaimInvite.update.mockResolvedValue({});
      const result = await service.registerFailure(
        invite({
          status: 'verification_required',
          failedAttempts: 2,
          lastFailedAt: new Date(now.getTime() - 1000),
        }),
        { ip: '1.2.3.0', userAgent: 'ua', plateInput: 'AB123CD' },
      );

      expect(result).toMatchObject({
        locked: false,
        autoRevoked: false,
        failedAttempts: 3,
      });
      expect(prisma.vehicleClaimInvite.update).toHaveBeenCalledWith({
        where: { id: 'invite-1' },
        data: { failedAttempts: 3, lastFailedAt: now },
      });
      expect(prisma.vehicleClaimAttempt.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ outcome: 'verification_failed' }),
      });
    });

    it('reinicia la ventana si pasaron más de 15 min del último fallo', async () => {
      prisma.vehicleClaimInvite.update.mockResolvedValue({});
      const result = await service.registerFailure(
        invite({
          failedAttempts: 4,
          lastFailedAt: new Date(now.getTime() - CLAIM_LOCK_WINDOW_MS - 1),
        }),
        { ip: null, userAgent: null, plateInput: null },
      );
      expect(result.failedAttempts).toBe(1);
    });

    it(`fallo ${CLAIM_MAX_FAILED_ATTEMPTS}: setea lock, incrementa lockout y deja lockout_started`, async () => {
      prisma.vehicleClaimInvite.update.mockResolvedValue({ lockoutCount: 1 });

      const result = await service.registerFailure(
        invite({
          status: 'verification_required',
          failedAttempts: CLAIM_MAX_FAILED_ATTEMPTS - 1,
          lastFailedAt: new Date(now.getTime() - 1000),
        }),
        { ip: null, userAgent: null, plateInput: null },
      );

      expect(result).toMatchObject({ locked: true, autoRevoked: false });
      expect(prisma.vehicleClaimInvite.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            verificationLockedAt: now,
            lockoutCount: { increment: 1 },
          }),
        }),
      );
      expect(prisma.vehicleClaimAttempt.create).toHaveBeenCalledWith({
        data: { inviteId: 'invite-1', outcome: 'lockout_started' },
      });
    });

    it(`tercer lockout (${CLAIM_MAX_LOCKOUTS}) auto-revoca`, async () => {
      prisma.vehicleClaimInvite.update
        .mockResolvedValueOnce({ lockoutCount: CLAIM_MAX_LOCKOUTS })
        .mockResolvedValueOnce({});

      const result = await service.registerFailure(
        invite({
          status: 'verification_required',
          failedAttempts: CLAIM_MAX_FAILED_ATTEMPTS - 1,
          lastFailedAt: new Date(now.getTime() - 1000),
        }),
        { ip: null, userAgent: null, plateInput: null },
      );

      expect(result).toMatchObject({
        status: 'revoked',
        locked: false,
        autoRevoked: true,
      });
      expect(prisma.vehicleClaimInvite.update).toHaveBeenLastCalledWith({
        where: { id: 'invite-1' },
        data: expect.objectContaining({
          status: 'revoked',
          revokeReason: 'max_attempts',
          verificationLockedAt: null,
        }),
      });
      expect(prisma.vehicleClaimAttempt.create).toHaveBeenCalledWith({
        data: { inviteId: 'invite-1', outcome: 'auto_revoked' },
      });
    });
  });

  describe('transiciones T5/T6/T20', () => {
    it('markVerified deja verifiedAt y NO setea usedAt (F-10)', async () => {
      await service.markVerified(invite({ status: 'verification_required' }));

      const call = prisma.vehicleClaimInvite.updateMany.mock.calls[0][0];
      expect(call.data).toMatchObject({ status: 'verified' });
      expect(call.data).not.toHaveProperty('usedAt');
      expect(prisma.vehicleClaimAttempt.create).toHaveBeenCalledWith({
        data: { inviteId: 'invite-1', outcome: 'verification_passed' },
      });
    });

    it('markManualReview nunca aprueba automáticamente', async () => {
      await service.markManualReview(invite());
      expect(prisma.vehicleClaimInvite.updateMany).toHaveBeenCalledWith({
        where: { id: 'invite-1', status: { in: expect.any(Array) } },
        data: { status: 'manual_review', verifiedAt: now },
      });
      expect(prisma.vehicleClaimAttempt.create).toHaveBeenCalledWith({
        data: { inviteId: 'invite-1', outcome: 'manual_review' },
      });
    });

    it('T20: resetVerifiedAfterTicketExpiry vuelve a verification_required', async () => {
      await service.resetVerifiedAfterTicketExpiry(
        invite({ status: 'verified', verifiedAt: now }),
      );
      expect(prisma.vehicleClaimInvite.updateMany).toHaveBeenCalledWith({
        where: { id: 'invite-1', status: 'verified' },
        data: { status: 'verification_required', verifiedAt: null },
      });
    });

    it('T20: no toca un invite que no está verified', async () => {
      await service.resetVerifiedAfterTicketExpiry(
        invite({ status: 'manual_review' }),
      );
      expect(prisma.vehicleClaimInvite.updateMany).not.toHaveBeenCalled();
    });
  });
});
