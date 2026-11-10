import { Logger } from '@nestjs/common';
import { VehicleClaimBlockedEvent } from '../events/vehicle-claim-blocked.event';
import { VehicleClaimBlockedListener } from './vehicle-claim-blocked.listener';

describe('VehicleClaimBlockedListener (C-4)', () => {
  let listener: VehicleClaimBlockedListener;
  let prisma: {
    vehicleClaimInvite: { findUnique: jest.Mock };
    vehicleOwnership: { findFirst: jest.Mock };
  };
  let mailService: {
    sendVehicleClaimBlockedOwnerEmail: jest.Mock;
    sendVehicleClaimWorkshopNotificationEmail: jest.Mock;
  };

  const makeInvite = (overrides: Record<string, unknown> = {}) => ({
    id: 'invite-1',
    vehicleId: 'vehicle-1',
    workshopId: 'workshop-1',
    careEpisodeId: 'episode-1',
    claimantUserId: 'blocked-user',
    claimOutcome: null,
    vehicle: { licensePlate: 'AB123CD' },
    workshop: { name: 'Taller Norte', email: 'taller@test.com' },
    claimant: {
      firstName: 'Atacante',
      lastName: 'X',
      email: 'blocked@test.com',
    },
    ...overrides,
  });

  const ownerRow = {
    user: {
      id: 'owner-1',
      firstName: 'Dueño',
      lastName: 'Real',
      email: 'owner@test.com',
    },
  };

  const event = new VehicleClaimBlockedEvent(
    'invite-1',
    'vehicle-1',
    'workshop-1',
    'blocked-user',
  );

  beforeEach(() => {
    prisma = {
      vehicleClaimInvite: {
        findUnique: jest.fn().mockResolvedValue(makeInvite()),
      },
      vehicleOwnership: {
        findFirst: jest.fn().mockResolvedValue(ownerRow),
      },
    };
    mailService = {
      sendVehicleClaimBlockedOwnerEmail: jest
        .fn()
        .mockResolvedValue({ ok: true }),
      sendVehicleClaimWorkshopNotificationEmail: jest
        .fn()
        .mockResolvedValue({ ok: true }),
    };
    listener = new VehicleClaimBlockedListener(
      prisma as never,
      mailService as never,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('envía mail al titular activo y al taller', async () => {
    await listener.handle(event);

    expect(mailService.sendVehicleClaimBlockedOwnerEmail).toHaveBeenCalledWith(
      'owner@test.com',
      'Dueño',
      'AB123CD',
      expect.objectContaining({ inviteId: 'invite-1', userId: 'owner-1' }),
    );
    expect(
      mailService.sendVehicleClaimWorkshopNotificationEmail,
    ).toHaveBeenCalledWith(
      'taller@test.com',
      'blocked',
      expect.objectContaining({ licensePlate: 'AB123CD' }),
      expect.objectContaining({ inviteId: 'invite-1' }),
    );
  });

  it('usa el titular activo, NUNCA el claimantUserId del evento (bloqueado)', async () => {
    await listener.handle(event);

    expect(mailService.sendVehicleClaimBlockedOwnerEmail).toHaveBeenCalledWith(
      'owner@test.com',
      'Dueño',
      'AB123CD',
      expect.any(Object),
    );
    expect(
      mailService.sendVehicleClaimBlockedOwnerEmail,
    ).not.toHaveBeenCalledWith(
      'blocked@test.com',
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
  });

  it('sin titular activo loguea warn y no manda el mail del dueño', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    prisma.vehicleOwnership.findFirst.mockResolvedValue(null);

    await listener.handle(event);

    expect(
      mailService.sendVehicleClaimBlockedOwnerEmail,
    ).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('no active owner user'),
    );
    expect(
      mailService.sendVehicleClaimWorkshopNotificationEmail,
    ).toHaveBeenCalled();
  });

  it('sin email del taller loguea warn y no manda el mail al taller', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    prisma.vehicleClaimInvite.findUnique.mockResolvedValue(
      makeInvite({ workshop: { name: 'Taller Norte', email: null } }),
    );

    await listener.handle(event);

    expect(mailService.sendVehicleClaimBlockedOwnerEmail).toHaveBeenCalled();
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
      mailService.sendVehicleClaimBlockedOwnerEmail,
    ).not.toHaveBeenCalled();
    expect(
      mailService.sendVehicleClaimWorkshopNotificationEmail,
    ).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('invite not found'),
    );
  });

  it('nunca envía token/hash', async () => {
    await listener.handle(event);

    const calls: unknown[] = [
      ...(mailService.sendVehicleClaimBlockedOwnerEmail.mock
        .calls as unknown[]),
      ...(mailService.sendVehicleClaimWorkshopNotificationEmail.mock
        .calls as unknown[]),
    ];
    expect(JSON.stringify(calls)).not.toMatch(/token|hash/i);
  });
});
