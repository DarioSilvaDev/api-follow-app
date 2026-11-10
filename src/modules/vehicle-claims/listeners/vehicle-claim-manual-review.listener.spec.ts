import { Logger } from '@nestjs/common';
import { VehicleClaimManualReviewEvent } from '../events/vehicle-claim-manual-review.event';
import { VehicleClaimManualReviewListener } from './vehicle-claim-manual-review.listener';

describe('VehicleClaimManualReviewListener (C-4)', () => {
  let listener: VehicleClaimManualReviewListener;
  let prisma: { vehicleClaimInvite: { findUnique: jest.Mock } };
  let mailService: { sendVehicleClaimWorkshopNotificationEmail: jest.Mock };

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

  const event = new VehicleClaimManualReviewEvent(
    'invite-1',
    'vehicle-1',
    'workshop-1',
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
    };
    listener = new VehicleClaimManualReviewListener(
      prisma as never,
      mailService as never,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('envía al taller con claimant null (cae a "Alguien" en el copy)', async () => {
    await listener.handle(event);

    expect(
      mailService.sendVehicleClaimWorkshopNotificationEmail,
    ).toHaveBeenCalledWith(
      'taller@test.com',
      'manual_review',
      expect.objectContaining({
        licensePlate: 'AB123CD',
        claimantName: null,
        claimantEmail: null,
      }),
      expect.objectContaining({ inviteId: 'invite-1' }),
    );
  });

  it('pasa el reclamante cuando existe', async () => {
    prisma.vehicleClaimInvite.findUnique.mockResolvedValue(
      makeInvite({
        claimantUserId: 'user-1',
        claimant: {
          firstName: 'Ana',
          lastName: 'Pérez',
          email: 'ana@test.com',
        },
      }),
    );

    await listener.handle(event);

    expect(
      mailService.sendVehicleClaimWorkshopNotificationEmail,
    ).toHaveBeenCalledWith(
      'taller@test.com',
      'manual_review',
      expect.objectContaining({
        claimantName: 'Ana Pérez',
        claimantEmail: 'ana@test.com',
      }),
      expect.any(Object),
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

  it('nunca envía token/hash', async () => {
    await listener.handle(event);

    expect(
      JSON.stringify(
        mailService.sendVehicleClaimWorkshopNotificationEmail.mock.calls,
      ),
    ).not.toMatch(/token|hash/i);
  });
});
