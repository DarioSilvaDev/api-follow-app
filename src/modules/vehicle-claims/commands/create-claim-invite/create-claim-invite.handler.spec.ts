import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import { CodedHttpException } from '../../../../common/exceptions/coded.exception';
import {
  CLAIM_ACTIVE_OWNER_MESSAGE,
  CLAIM_NOT_FOUND_MESSAGE,
} from '../../claim-messages';
import { CreateClaimInviteDto } from '../../dto/create-claim-invite.dto';
import { CreateClaimInviteCommand } from './create-claim-invite.command';
import {
  CLAIM_INVITE_TTL_MS,
  CreateClaimInviteHandler,
} from './create-claim-invite.handler';

async function capture(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('La promesa debía rechazar y resolvió');
}

describe('CreateClaimInviteHandler — D-TL-VC-9', () => {
  let handler: CreateClaimInviteHandler;
  let prisma: {
    vehicle: { findUnique: jest.Mock };
    careEpisode: { findFirst: jest.Mock };
    vehicleOwnerContact: { findFirst: jest.Mock };
    vehicleOwnership: { findFirst: jest.Mock };
    vehicleClaimInvite: {
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      updateMany: jest.Mock;
    };
  };
  let vehicleAccess: { assertVehicleAccess: jest.Mock };
  let tokenService: { hashToken: jest.Mock };
  let qr: { generateAndUpload: jest.Mock; signedUrl: jest.Mock };
  let eventEmitter: { emit: jest.Mock };

  const vehicleId = '22222222-2222-2222-2222-222222222222';
  const workshopId = '33333333-3333-3333-3333-333333333333';
  const userId = '44444444-4444-4444-4444-444444444444';
  const inviteId = '11111111-1111-1111-1111-111111111111';

  let activeInvite: Record<string, unknown> | null;
  let claimedInvite: Record<string, unknown> | null;
  let expiredInvite: Record<string, unknown> | null;
  let latestInvite: Record<string, unknown> | null;
  let ownerActive: boolean;

  function row(overrides: Record<string, unknown> = {}) {
    return {
      id: inviteId,
      vehicleId,
      workshopId,
      careEpisodeId: null,
      status: 'pending',
      expiresAt: new Date(Date.now() + CLAIM_INVITE_TTL_MS),
      ownerPhone: null,
      qrObjectKey: 'vehicle-claims/qr/abc.webp',
      createdByUserId: null,
      createdAt: new Date('2026-11-01T10:00:00.000Z'),
      ...overrides,
    };
  }

  function command(
    overrides: Partial<CreateClaimInviteDto> = {},
  ): CreateClaimInviteCommand {
    return new CreateClaimInviteCommand(
      { vehicleId, ...overrides } as CreateClaimInviteDto,
      {
        type: 'WORKSHOP',
        userId,
        workshopId,
        memberId: 'member-1',
        roleId: 'role-1',
      },
      { id: userId, email: 'taller@example.com' },
    );
  }

  beforeEach(() => {
    activeInvite = null;
    claimedInvite = null;
    expiredInvite = null;
    latestInvite = null;
    ownerActive = false;

    prisma = {
      vehicle: {
        findUnique: jest.fn().mockResolvedValue({
          id: vehicleId,
          licensePlate: 'AB123CD',
          deletedAt: null,
        }),
      },
      careEpisode: {
        findFirst: jest.fn().mockResolvedValue({ id: 'episode-1' }),
      },
      vehicleOwnerContact: {
        findFirst: jest.fn().mockResolvedValue({ phoneE164: '+5491123456789' }),
      },
      vehicleOwnership: { findFirst: jest.fn() },
      vehicleClaimInvite: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };

    prisma.vehicleClaimInvite.findFirst.mockImplementation(
      ({ where }: { where: Record<string, any> }) => {
        if (where.status === 'claimed') return Promise.resolve(claimedInvite);
        if (where.status === 'expired') return Promise.resolve(expiredInvite);
        if (where.status?.in) return Promise.resolve(activeInvite);
        return Promise.resolve(latestInvite);
      },
    );
    prisma.vehicleOwnership.findFirst.mockImplementation(() =>
      Promise.resolve(ownerActive ? { id: 'ownership-1' } : null),
    );

    vehicleAccess = {
      assertVehicleAccess: jest.fn().mockResolvedValue(undefined),
    };
    tokenService = { hashToken: jest.fn().mockReturnValue('a'.repeat(64)) };
    qr = {
      generateAndUpload: jest
        .fn()
        .mockResolvedValue('vehicle-claims/qr/new.webp'),
      signedUrl: jest
        .fn()
        .mockImplementation((key: string | null) =>
          Promise.resolve(key ? 'https://cdn.example.com/qr.webp' : null),
        ),
    };
    eventEmitter = { emit: jest.fn() };

    handler = new CreateClaimInviteHandler(
      prisma as never,
      vehicleAccess as never,
      tokenService as never,
      qr as never,
      eventEmitter as unknown as EventEmitter2,
    );
  });

  it('PERSONAL → 403 sin consultar el vehículo', async () => {
    const error = await capture(
      handler.execute(
        new CreateClaimInviteCommand(
          { vehicleId } as CreateClaimInviteDto,
          { type: 'PERSONAL', userId },
          { id: userId, email: 'x@example.com' },
        ),
      ),
    );

    expect(error).toBeInstanceOf(ForbiddenException);
    expect(vehicleAccess.assertVehicleAccess).not.toHaveBeenCalled();
  });

  it('vehículo inexistente → 404 con el copy del panel', async () => {
    prisma.vehicle.findUnique.mockResolvedValue(null);

    const error = await capture(handler.execute(command()));

    expect(error).toBeInstanceOf(NotFoundException);
    expect((error as Error).message).toBe(CLAIM_NOT_FOUND_MESSAGE);
  });

  it('careEpisode de otro vehículo/taller → 400', async () => {
    prisma.careEpisode.findFirst.mockResolvedValue(null);

    const error = await capture(
      handler.execute(command({ careEpisodeId: 'episode-1' })),
    );

    expect(error).toBeInstanceOf(BadRequestException);
  });

  it('invite vigente → 200 (reused) SIN link ni whatsappUrl', async () => {
    activeInvite = row({ status: 'verification_required' });

    const result = await handler.execute(command());

    expect(result.reused).toBe(true);
    expect(result.data.link).toBeUndefined();
    expect(result.data.whatsappUrl).toBeUndefined();
    expect(result.data.qrImageUrl).toBe('https://cdn.example.com/qr.webp');
    expect(prisma.vehicleClaimInvite.create).not.toHaveBeenCalled();
    expect(eventEmitter.emit).not.toHaveBeenCalled();
  });

  it('sin invite previo → 201 (reused=false) con link, whatsappUrl y evento', async () => {
    prisma.vehicleClaimInvite.create.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve(row({ ...data, id: inviteId })),
    );

    const result = await handler.execute(command());

    expect(result.reused).toBe(false);
    expect(result.data.link).toMatch(/\/reclamo\/[0-9a-f]{64}$/);
    expect(result.data.whatsappUrl).toMatch(
      /^https:\/\/wa\.me\/5491123456789\?text=/,
    );
    expect(tokenService.hashToken).toHaveBeenCalledWith(
      expect.stringMatching(/^[0-9a-f]{64}$/),
    );
    expect(prisma.vehicleClaimInvite.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          vehicleId,
          workshopId,
          status: 'pending',
          ownerPhone: '+5491123456789',
        }),
      }),
    );
    expect(eventEmitter.emit).toHaveBeenCalledWith(
      'vehicle-claim.invited',
      expect.objectContaining({ inviteId, reactivated: false }),
    );
  });

  it('ownerPhone del body gana al contacto guardado', async () => {
    prisma.vehicleClaimInvite.create.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve(row({ ...data })),
    );

    await handler.execute(command({ ownerPhone: '+5491199998888' }));

    expect(prisma.vehicleOwnerContact.findFirst).not.toHaveBeenCalled();
    expect(prisma.vehicleClaimInvite.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ ownerPhone: '+5491199998888' }),
      }),
    );
  });

  it('titular activo → 409 active_owner en errors.reason', async () => {
    ownerActive = true;

    const error = (await capture(
      handler.execute(command()),
    )) as CodedHttpException;

    expect(error).toBeInstanceOf(CodedHttpException);
    expect(error.message).toBe(CLAIM_ACTIVE_OWNER_MESSAGE);
    expect(error.getResponse()).toMatchObject({
      statusCode: 409,
      errors: { reason: 'active_owner' },
    });
    expect(prisma.vehicleClaimInvite.create).not.toHaveBeenCalled();
  });

  it('vehículo ya reclamado → 409 already_claimed', async () => {
    claimedInvite = row({ status: 'claimed' });

    const error = (await capture(
      handler.execute(command()),
    )) as CodedHttpException;

    expect(error).toBeInstanceOf(CodedHttpException);
    expect(error.getResponse()).toMatchObject({
      statusCode: 409,
      errors: { reason: 'already_claimed' },
    });
  });

  it('último invite revoked/claim_blocked → crea uno nuevo', async () => {
    prisma.vehicleClaimInvite.create.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve(row({ ...data })),
    );

    const result = await handler.execute(command());

    expect(result.reused).toBe(false);
    expect(result.data.link).toBeDefined();
    expect(prisma.vehicleClaimInvite.create).toHaveBeenCalled();
  });

  it('último invite expired → reactiva el MISMO id con token y contadores nuevos', async () => {
    expiredInvite = row({ status: 'expired', ownerPhone: '+5491100000000' });
    prisma.vehicleClaimInvite.findUnique.mockResolvedValue(
      row({ status: 'pending', ownerPhone: '+5491123456789' }),
    );

    const result = await handler.execute(command());

    expect(result.reused).toBe(true);
    expect(result.data.id).toBe(inviteId);
    expect(result.data.link).toMatch(/\/reclamo\/[0-9a-f]{64}$/);
    expect(prisma.vehicleClaimInvite.updateMany).toHaveBeenCalledWith({
      where: { id: inviteId, status: 'expired' },
      data: expect.objectContaining({
        status: 'pending',
        tokenHash: expect.stringMatching(/^[0-9a-f]{64}$/),
        expiresAt: expect.any(Date),
        openedAt: null,
        verifiedAt: null,
        failedAttempts: 0,
        lastFailedAt: null,
        verificationLockedAt: null,
        lockoutCount: 0,
        usedAt: null,
        blockedAt: null,
        revokedAt: null,
        revokeReason: null,
        claimOutcome: null,
        claimantUserId: null,
      }),
    });
    expect(prisma.vehicleClaimInvite.create).not.toHaveBeenCalled();
    expect(eventEmitter.emit).toHaveBeenCalledWith(
      'vehicle-claim.invited',
      expect.objectContaining({ inviteId, reactivated: true }),
    );
  });

  it('invite abierto ya vencido → lo expira lazy y luego lo reactiva', async () => {
    activeInvite = row({
      status: 'pending',
      expiresAt: new Date(Date.now() - 1000),
    });
    expiredInvite = row({ status: 'expired' });
    prisma.vehicleClaimInvite.findUnique.mockResolvedValue(
      row({ status: 'pending' }),
    );

    const result = await handler.execute(command());

    expect(prisma.vehicleClaimInvite.updateMany).toHaveBeenCalledWith({
      where: { id: inviteId, status: { in: expect.any(Array) } },
      data: { status: 'expired' },
    });
    expect(result.reused).toBe(true);
    expect(result.data.link).toBeDefined();
  });

  it('sin ownerPhone ni contacto → whatsappUrl null y QR de mostrador', async () => {
    prisma.vehicleOwnerContact.findFirst.mockResolvedValue(null);
    prisma.vehicleClaimInvite.create.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve(row({ ...data })),
    );

    const result = await handler.execute(command());

    expect(result.data.ownerPhone).toBeNull();
    expect(result.data.whatsappUrl).toBeNull();
    expect(result.data.link).toBeDefined();
  });

  it('fallo de storage del QR no bloquea la creación', async () => {
    qr.generateAndUpload.mockResolvedValue(null);
    prisma.vehicleClaimInvite.create.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve(row({ ...data, qrObjectKey: null })),
    );

    const result = await handler.execute(command());

    expect(result.data.link).toBeDefined();
    expect(result.data.qrImageUrl).toBeNull();
  });

  describe('executeFromClose — hook care-episode.closed (C-5)', () => {
    const careEpisodeId = 'episode-close-1';

    function closeParams() {
      return { vehicleId, workshopId, careEpisodeId };
    }

    it('primer cierre sin invite → crea con careEpisodeId y ownerPhone del contacto', async () => {
      prisma.vehicleClaimInvite.create.mockImplementation(
        ({ data }: { data: Record<string, unknown> }) =>
          Promise.resolve(row({ ...data })),
      );

      const result = await handler.executeFromClose(closeParams());

      expect(result).toEqual({ action: 'created', inviteId });
      expect(vehicleAccess.assertVehicleAccess).not.toHaveBeenCalled();
      expect(prisma.vehicleClaimInvite.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            vehicleId,
            workshopId,
            careEpisodeId,
            status: 'pending',
            ownerPhone: '+5491123456789',
            createdByUserId: null,
          }),
        }),
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'vehicle-claim.invited',
        expect.objectContaining({ inviteId, reactivated: false }),
      );
    });

    it('dos cierres seguidos → un solo invite (el segundo es idempotente)', async () => {
      prisma.vehicleClaimInvite.create.mockImplementation(
        ({ data }: { data: Record<string, unknown> }) => {
          activeInvite = row({ ...data });
          return Promise.resolve(activeInvite);
        },
      );

      const first = await handler.executeFromClose(closeParams());
      const second = await handler.executeFromClose(closeParams());

      expect(first).toEqual({ action: 'created', inviteId });
      expect(second).toEqual({
        action: 'skipped',
        reason: 'active_invite',
      });
      expect(prisma.vehicleClaimInvite.create).toHaveBeenCalledTimes(1);
      expect(eventEmitter.emit).toHaveBeenCalledTimes(1);
    });

    it('invite vigente → skipped active_invite sin crear', async () => {
      activeInvite = row({ status: 'verification_required' });

      const result = await handler.executeFromClose(closeParams());

      expect(result).toEqual({ action: 'skipped', reason: 'active_invite' });
      expect(prisma.vehicleClaimInvite.create).not.toHaveBeenCalled();
    });

    it('invite abierto ya vencido → expira lazy y reactiva el MISMO id', async () => {
      activeInvite = row({
        status: 'pending',
        expiresAt: new Date(Date.now() - 1000),
      });
      latestInvite = row({ status: 'expired' });
      prisma.vehicleClaimInvite.findUnique.mockResolvedValue(
        row({ status: 'pending', careEpisodeId }),
      );

      const result = await handler.executeFromClose(closeParams());

      expect(result).toEqual({ action: 'reactivated', inviteId });
      expect(prisma.vehicleClaimInvite.updateMany).toHaveBeenNthCalledWith(1, {
        where: { id: inviteId, status: { in: expect.any(Array) } },
        data: { status: 'expired' },
      });
      expect(prisma.vehicleClaimInvite.updateMany).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          where: { id: inviteId, status: 'expired' },
          data: expect.objectContaining({
            status: 'pending',
            careEpisodeId,
            createdByUserId: null,
            failedAttempts: 0,
          }),
        }),
      );
      expect(prisma.vehicleClaimInvite.create).not.toHaveBeenCalled();
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'vehicle-claim.invited',
        expect.objectContaining({ inviteId, reactivated: true }),
      );
    });

    it('titular activo → skipped active_owner sin crear', async () => {
      ownerActive = true;

      const result = await handler.executeFromClose(closeParams());

      expect(result).toEqual({ action: 'skipped', reason: 'active_owner' });
      expect(prisma.vehicleClaimInvite.create).not.toHaveBeenCalled();
    });

    it('invite claimed → skipped already_claimed sin crear', async () => {
      claimedInvite = row({ status: 'claimed' });

      const result = await handler.executeFromClose(closeParams());

      expect(result).toEqual({ action: 'skipped', reason: 'already_claimed' });
      expect(prisma.vehicleClaimInvite.create).not.toHaveBeenCalled();
    });

    it.each(['revoked', 'claim_blocked'] as const)(
      'último invite %s → no lo revive solo',
      async (status) => {
        latestInvite = row({ status });

        const result = await handler.executeFromClose(closeParams());

        expect(result).toEqual({ action: 'skipped', reason: status });
        expect(prisma.vehicleClaimInvite.create).not.toHaveBeenCalled();
        expect(prisma.vehicleClaimInvite.updateMany).not.toHaveBeenCalled();
      },
    );

    it('vehículo soft-deleted → skipped vehicle_not_found', async () => {
      prisma.vehicle.findUnique.mockResolvedValue({
        id: vehicleId,
        licensePlate: 'AB123CD',
        deletedAt: new Date(),
      });

      const result = await handler.executeFromClose(closeParams());

      expect(result).toEqual({
        action: 'skipped',
        reason: 'vehicle_not_found',
      });
      expect(prisma.vehicleClaimInvite.create).not.toHaveBeenCalled();
    });

    it('sin contacto disponible → crea igual con ownerPhone null (AC-23)', async () => {
      prisma.vehicleOwnerContact.findFirst.mockResolvedValue(null);
      prisma.vehicleClaimInvite.create.mockImplementation(
        ({ data }: { data: Record<string, unknown> }) =>
          Promise.resolve(row({ ...data })),
      );

      const result = await handler.executeFromClose(closeParams());

      expect(result).toEqual({ action: 'created', inviteId });
      expect(prisma.vehicleClaimInvite.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ ownerPhone: null }),
        }),
      );
    });

    it('carrera perdida contra el índice parcial → skipped active_invite', async () => {
      const p2002 = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed on the fields: (`vehicle_id`)',
        {
          code: 'P2002',
          clientVersion: '6.19.3',
          meta: { target: ['vehicle_id'] },
        },
      );
      prisma.vehicleClaimInvite.create.mockImplementation(() => {
        activeInvite = row();
        return Promise.reject(p2002);
      });

      const result = await handler.executeFromClose(closeParams());

      expect(result).toEqual({ action: 'skipped', reason: 'active_invite' });
    });
  });
});
