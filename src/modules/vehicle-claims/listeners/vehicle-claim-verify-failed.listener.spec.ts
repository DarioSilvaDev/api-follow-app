import { Logger } from '@nestjs/common';
import { VehicleClaimVerifyFailedEvent } from '../events/vehicle-claim-verify-failed.event';
import { VehicleClaimVerifyFailedListener } from './vehicle-claim-verify-failed.listener';

describe('VehicleClaimVerifyFailedListener (C-4)', () => {
  let listener: VehicleClaimVerifyFailedListener;
  let prisma: { vehicleClaimInvite: { findUnique: jest.Mock } };
  let mailService: { sendVehicleClaimWorkshopNotificationEmail: jest.Mock };

  const event = new VehicleClaimVerifyFailedEvent(
    'invite-1',
    'vehicle-1',
    'workshop-1',
    2,
    false,
    false,
  );

  const makeInvite = (overrides: Record<string, unknown> = {}) => ({
    id: 'invite-1',
    vehicleId: 'vehicle-1',
    workshopId: 'workshop-1',
    careEpisodeId: 'episode-1',
    claimantUserId: null,
    claimOutcome: null,
    vehicle: { licensePlate: 'AB123CD' },
    workshop: { name: 'Taller Norte', email: 'taller@test.com' },
    claimant: null,
    ...overrides,
  });

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
    };
    listener = new VehicleClaimVerifyFailedListener(
      prisma as never,
      mailService as never,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('envía el aviso de intento fallido al taller', async () => {
    await listener.handle(event);

    expect(
      mailService.sendVehicleClaimWorkshopNotificationEmail,
    ).toHaveBeenCalledWith(
      'taller@test.com',
      'verify_failed',
      expect.objectContaining({
        vehicleId: 'vehicle-1',
        licensePlate: 'AB123CD',
        failedAttempts: 2,
      }),
      expect.objectContaining({ inviteId: 'invite-1' }),
    );
  });

  it('skip + warn cuando el taller no tiene email', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    prisma.vehicleClaimInvite.findUnique.mockResolvedValue(
      makeInvite({ workshop: { name: 'Taller Norte', email: null } }),
    );

    await listener.handle(event);

    expect(
      mailService.sendVehicleClaimWorkshopNotificationEmail,
    ).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('workshop email missing'),
    );
  });

  it('skip + warn cuando el invite no existe', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    prisma.vehicleClaimInvite.findUnique.mockResolvedValue(null);

    await listener.handle(event);

    expect(
      mailService.sendVehicleClaimWorkshopNotificationEmail,
    ).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('invite not found'),
    );
  });

  it('nunca loguea ni envía token/hash', async () => {
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();

    await listener.handle(event);

    const logged = JSON.stringify([...log.mock.calls, ...warn.mock.calls]);
    expect(logged).not.toMatch(/token|hash/i);
    expect(
      JSON.stringify(
        mailService.sendVehicleClaimWorkshopNotificationEmail.mock.calls,
      ),
    ).not.toMatch(/token|hash/i);
  });
});
