import { Logger } from '@nestjs/common';
import type { VehicleClaimOutcome } from '@prisma/client';
import { VehicleClaimClaimedEvent } from '../events/vehicle-claim-claimed.event';
import { VehicleClaimClaimedListener } from './vehicle-claim-claimed.listener';

describe('VehicleClaimClaimedListener (C-4)', () => {
  let listener: VehicleClaimClaimedListener;
  let prisma: { vehicleClaimInvite: { findUnique: jest.Mock } };
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

  const makeEvent = (outcome: VehicleClaimOutcome = 'ownership_created') =>
    new VehicleClaimClaimedEvent(
      'invite-1',
      'vehicle-1',
      'workshop-1',
      'user-1',
      outcome,
    );

  beforeEach(() => {
    prisma = {
      vehicleClaimInvite: {
        findUnique: jest.fn().mockResolvedValue(makeInvite()),
      },
    };
    mailService = {
      sendVehicleClaimWorkshopNotificationEmail: jest
        .fn()
        .mockResolvedValue({ ok: true }),
      sendVehicleClaimResultEmail: jest.fn().mockResolvedValue({ ok: true }),
    };
    listener = new VehicleClaimClaimedListener(
      prisma as never,
      mailService as never,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('envía ambos mails: taller + reclamante', async () => {
    await listener.handle(makeEvent());

    expect(
      mailService.sendVehicleClaimWorkshopNotificationEmail,
    ).toHaveBeenCalledWith(
      'taller@test.com',
      'claimed',
      expect.objectContaining({
        claimantName: 'Ana Pérez',
        claimantEmail: 'ana@test.com',
        alreadyOwner: false,
      }),
      expect.objectContaining({ inviteId: 'invite-1' }),
    );
    expect(mailService.sendVehicleClaimResultEmail).toHaveBeenCalledWith(
      'ana@test.com',
      'Ana',
      'AB123CD',
      'claimed',
      expect.objectContaining({ inviteId: 'invite-1' }),
    );
  });

  it('already_owner pasa el flag y envía ambos mails igual', async () => {
    await listener.handle(makeEvent('already_owner'));

    expect(
      mailService.sendVehicleClaimWorkshopNotificationEmail,
    ).toHaveBeenCalledWith(
      'taller@test.com',
      'claimed',
      expect.objectContaining({ alreadyOwner: true }),
      expect.any(Object),
    );
    expect(mailService.sendVehicleClaimResultEmail).toHaveBeenCalled();
  });

  it('sin reclamante avisa al taller y loguea el skip del resultado', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    prisma.vehicleClaimInvite.findUnique.mockResolvedValue(
      makeInvite({ claimant: null, claimantUserId: null }),
    );

    await listener.handle(makeEvent());

    expect(
      mailService.sendVehicleClaimWorkshopNotificationEmail,
    ).toHaveBeenCalledWith(
      'taller@test.com',
      'claimed',
      expect.objectContaining({ claimantName: null, claimantEmail: null }),
      expect.any(Object),
    );
    expect(mailService.sendVehicleClaimResultEmail).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('claimant missing'),
    );
  });

  it('sin email del taller igual envía el mail al reclamante', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    prisma.vehicleClaimInvite.findUnique.mockResolvedValue(
      makeInvite({ workshop: { name: 'Taller Norte', email: null } }),
    );

    await listener.handle(makeEvent());

    expect(
      mailService.sendVehicleClaimWorkshopNotificationEmail,
    ).not.toHaveBeenCalled();
    expect(mailService.sendVehicleClaimResultEmail).toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('workshop email missing'),
    );
  });

  it('skip + warn cuando el invite no existe', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    prisma.vehicleClaimInvite.findUnique.mockResolvedValue(null);

    await listener.handle(makeEvent());

    expect(
      mailService.sendVehicleClaimWorkshopNotificationEmail,
    ).not.toHaveBeenCalled();
    expect(mailService.sendVehicleClaimResultEmail).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('invite not found'),
    );
  });

  it('nunca envía token/hash', async () => {
    await listener.handle(makeEvent());

    const calls: unknown[] = [
      ...(mailService.sendVehicleClaimWorkshopNotificationEmail.mock
        .calls as unknown[]),
      ...(mailService.sendVehicleClaimResultEmail.mock.calls as unknown[]),
    ];
    expect(JSON.stringify(calls)).not.toMatch(/token|hash/i);
  });
});
