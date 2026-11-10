import { Logger } from '@nestjs/common';
import type { VehicleClaimRevokeReason } from '@prisma/client';
import { VehicleClaimRevokedEvent } from '../events/vehicle-claim-revoked.event';
import { VehicleClaimRevokedListener } from './vehicle-claim-revoked.listener';

describe('VehicleClaimRevokedListener (C-4)', () => {
  let listener: VehicleClaimRevokedListener;
  let prisma: {
    vehicleClaimInvite: { findUnique: jest.Mock };
    vehicleOwnership: { findFirst: jest.Mock };
  };
  let mailService: {
    sendVehicleClaimWorkshopNotificationEmail: jest.Mock;
    sendVehicleClaimResultEmail: jest.Mock;
  };

  const makeInvite = (overrides: Record<string, unknown> = {}) => ({
    id: 'invite-1',
    vehicleId: 'vehicle-1',
    workshopId: 'workshop-1',
    careEpisodeId: 'episode-1',
    claimantUserId: 'user-1',
    claimOutcome: 'ownership_created',
    vehicle: { licensePlate: 'AB123CD' },
    workshop: { name: 'Taller Norte', email: 'taller@test.com' },
    claimant: { firstName: 'Ana', lastName: 'Pérez', email: 'ana@test.com' },
    ...overrides,
  });

  const makeEvent = (reason: VehicleClaimRevokeReason) =>
    new VehicleClaimRevokedEvent(
      'invite-1',
      'vehicle-1',
      'workshop-1',
      reason,
      reason === 'max_attempts',
    );

  beforeEach(() => {
    prisma = {
      vehicleClaimInvite: {
        findUnique: jest.fn().mockResolvedValue(makeInvite()),
      },
      vehicleOwnership: {
        findFirst: jest.fn().mockResolvedValue({ id: 'ownership-1' }),
      },
    };
    mailService = {
      sendVehicleClaimWorkshopNotificationEmail: jest
        .fn()
        .mockResolvedValue({ ok: true }),
      sendVehicleClaimResultEmail: jest.fn().mockResolvedValue({ ok: true }),
    };
    listener = new VehicleClaimRevokedListener(
      prisma as never,
      mailService as never,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('max_attempts → aviso auto_revoked al taller', async () => {
    await listener.handle(makeEvent('max_attempts'));

    expect(
      mailService.sendVehicleClaimWorkshopNotificationEmail,
    ).toHaveBeenCalledWith(
      'taller@test.com',
      'auto_revoked',
      expect.objectContaining({ licensePlate: 'AB123CD' }),
      expect.objectContaining({ inviteId: 'invite-1' }),
    );
    expect(mailService.sendVehicleClaimResultEmail).not.toHaveBeenCalled();
  });

  it('max_attempts sin email del taller → skip + warn', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    prisma.vehicleClaimInvite.findUnique.mockResolvedValue(
      makeInvite({ workshop: { name: 'Taller Norte', email: null } }),
    );

    await listener.handle(makeEvent('max_attempts'));

    expect(
      mailService.sendVehicleClaimWorkshopNotificationEmail,
    ).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('workshop email missing'),
    );
  });

  it('by_workshop con ownership deshecho → mail al reclamante', async () => {
    await listener.handle(makeEvent('by_workshop'));

    expect(prisma.vehicleOwnership.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          acquiredByClaimInviteId: 'invite-1',
          endsAt: { not: null },
        },
      }),
    );
    expect(mailService.sendVehicleClaimResultEmail).toHaveBeenCalledWith(
      'ana@test.com',
      'Ana',
      'AB123CD',
      'revoked',
      expect.objectContaining({ inviteId: 'invite-1' }),
    );
  });

  it('by_workshop sin ownership deshecho → ningún mail (log, no warn)', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    prisma.vehicleOwnership.findFirst.mockResolvedValue(null);

    await listener.handle(makeEvent('by_workshop'));

    expect(mailService.sendVehicleClaimResultEmail).not.toHaveBeenCalled();
    expect(
      mailService.sendVehicleClaimWorkshopNotificationEmail,
    ).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('ownership not undone'),
    );
    expect(warn).not.toHaveBeenCalled();
  });

  it('by_workshop con outcome distinto de ownership_created → ningún mail', async () => {
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    prisma.vehicleClaimInvite.findUnique.mockResolvedValue(
      makeInvite({ claimOutcome: 'already_owner' }),
    );

    await listener.handle(makeEvent('by_workshop'));

    expect(mailService.sendVehicleClaimResultEmail).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('outcome not ownership_created'),
    );
  });

  it('manual_review_rejected → mail de rechazo al reclamante', async () => {
    await listener.handle(makeEvent('manual_review_rejected'));

    expect(mailService.sendVehicleClaimResultEmail).toHaveBeenCalledWith(
      'ana@test.com',
      'Ana',
      'AB123CD',
      'review_rejected',
      expect.any(Object),
    );
  });

  it('manual_review_rejected sin reclamante → skip + warn', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    prisma.vehicleClaimInvite.findUnique.mockResolvedValue(
      makeInvite({ claimant: null, claimantUserId: null }),
    );

    await listener.handle(makeEvent('manual_review_rejected'));

    expect(mailService.sendVehicleClaimResultEmail).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('claimant missing'),
    );
  });

  it.each(['by_admin', 'vehicle_deleted', 'dispute_lost'] as const)(
    '%s → ningún mail + warn',
    async (reason) => {
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();

      await listener.handle(makeEvent(reason));

      expect(
        mailService.sendVehicleClaimWorkshopNotificationEmail,
      ).not.toHaveBeenCalled();
      expect(mailService.sendVehicleClaimResultEmail).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining(`reason=${reason}`),
      );
    },
  );

  it('skip + warn cuando el invite no existe', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    prisma.vehicleClaimInvite.findUnique.mockResolvedValue(null);

    await listener.handle(makeEvent('max_attempts'));

    expect(
      mailService.sendVehicleClaimWorkshopNotificationEmail,
    ).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('invite not found'),
    );
  });

  it('nunca envía token/hash', async () => {
    await listener.handle(makeEvent('by_workshop'));

    const calls: unknown[] = [
      ...(mailService.sendVehicleClaimWorkshopNotificationEmail.mock
        .calls as unknown[]),
      ...(mailService.sendVehicleClaimResultEmail.mock.calls as unknown[]),
    ];
    expect(JSON.stringify(calls)).not.toMatch(/token|hash/i);
  });
});
