import { NotFoundException } from '@nestjs/common';
import { CLAIM_NOT_FOUND_MESSAGE } from '../../claim-messages';
import { GetClaimHandler } from './get-claim.handler';

describe('GetClaimHandler — detalle del panel', () => {
  let handler: GetClaimHandler;
  let prisma: {
    vehicleClaimInvite: { findFirst: jest.Mock };
    systemRoleAssignment: { findMany: jest.Mock };
    workshopMember: { findUnique: jest.Mock };
  };
  let qr: { signedUrl: jest.Mock };
  let permissionCache: { get: jest.Mock };

  const id = '11111111-1111-1111-1111-111111111111';
  const workshopId = '33333333-3333-3333-3333-333333333333';
  const userId = '44444444-4444-4444-4444-444444444444';

  function invite(overrides: Record<string, unknown> = {}) {
    return {
      id,
      vehicleId: 'vehicle-1',
      careEpisodeId: null,
      status: 'manual_review',
      claimOutcome: null,
      ownerPhone: null,
      claimantUserId: 'claimant-1',
      openedAt: new Date('2026-11-01T10:00:00.000Z'),
      verifiedAt: new Date('2026-11-01T10:05:00.000Z'),
      usedAt: null,
      failedAttempts: 0,
      lastFailedAt: null,
      verificationLockedAt: null,
      lockoutCount: 0,
      expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
      blockedAt: null,
      revokedAt: null,
      revokeReason: null,
      createdAt: new Date('2026-11-01T10:00:00.000Z'),
      updatedAt: new Date('2026-11-01T10:05:00.000Z'),
      qrObjectKey: 'vehicle-claims/qr/abc.webp',
      vehicle: {
        licensePlate: 'AB123CD',
        manufactureYear: 2020,
        brandName: 'Fiat',
        modelName: 'Cronos',
        version: {
          name: '1.3 Drive',
          model: { name: 'Cronos', brand: { name: 'Fiat' } },
        },
      },
      claimant: {
        firstName: 'Ana',
        lastName: 'Pérez',
        email: 'ana@example.com',
      },
      attempts: [
        {
          id: 'attempt-1',
          outcome: 'manual_review',
          createdAt: new Date('2026-11-01T10:05:00.000Z'),
        },
      ],
      ...overrides,
    };
  }

  function withReviewPermission(): void {
    permissionCache.get.mockReturnValue({
      systemRoles: [],
      permissions: new Set(['vehicle-claim.list', 'vehicle-claim.review']),
    });
  }

  beforeEach(() => {
    prisma = {
      vehicleClaimInvite: { findFirst: jest.fn() },
      systemRoleAssignment: { findMany: jest.fn().mockResolvedValue([]) },
      workshopMember: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    qr = { signedUrl: jest.fn().mockResolvedValue('https://cdn/qr.webp') };
    permissionCache = { get: jest.fn() };

    handler = new GetClaimHandler(
      prisma as never,
      qr as never,
      permissionCache as never,
    );
  });

  it('invite inexistente o de otro taller → 404', async () => {
    prisma.vehicleClaimInvite.findFirst.mockResolvedValue(null);

    await expect(handler.execute({ id, workshopId, userId })).rejects.toThrow(
      new NotFoundException(CLAIM_NOT_FOUND_MESSAGE),
    );
    expect(prisma.vehicleClaimInvite.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id, workshopId } }),
    );
  });

  it('manual_review con vehicle-claim.review → incluye la cuenta del reclamante', async () => {
    prisma.vehicleClaimInvite.findFirst.mockResolvedValue(invite());
    withReviewPermission();

    const result = await handler.execute({ id, workshopId, userId });

    expect(result.data.claimant).toEqual({
      firstName: 'Ana',
      lastName: 'Pérez',
      email: 'ana@example.com',
    });
    expect(result.data.qrImageUrl).toBe('https://cdn/qr.webp');
    expect(result.data.vehicle).toEqual({
      licensePlate: 'AB123CD',
      brand: 'Fiat',
      model: 'Cronos',
      manufactureYear: 2020,
    });
    expect(result.data.attempts).toHaveLength(1);
    expect(result.data).not.toHaveProperty('token');
    expect(result.data).not.toHaveProperty('link');
  });

  it('manual_review sin vehicle-claim.review → claimant null', async () => {
    prisma.vehicleClaimInvite.findFirst.mockResolvedValue(invite());
    permissionCache.get.mockReturnValue({
      systemRoles: [],
      permissions: new Set(['vehicle-claim.list']),
    });

    const result = await handler.execute({ id, workshopId, userId });

    expect(result.data.claimant).toBeNull();
  });

  it('super_admin hace bypass del permiso de review', async () => {
    prisma.vehicleClaimInvite.findFirst.mockResolvedValue(invite());
    permissionCache.get.mockReturnValue({
      systemRoles: ['super_admin'],
      permissions: new Set(['vehicle-claim.list']),
    });

    const result = await handler.execute({ id, workshopId, userId });

    expect(result.data.claimant).not.toBeNull();
  });

  it('claimed con review → NO expone la cuenta (sólo manual_review)', async () => {
    prisma.vehicleClaimInvite.findFirst.mockResolvedValue(
      invite({ status: 'claimed' }),
    );
    withReviewPermission();

    const result = await handler.execute({ id, workshopId, userId });

    expect(result.data.status).toBe('claimed');
    expect(result.data.claimant).toBeNull();
  });

  it('sin caché consulta el rol del miembro activo', async () => {
    prisma.vehicleClaimInvite.findFirst.mockResolvedValue(invite());
    permissionCache.get.mockReturnValue(undefined);
    prisma.workshopMember.findUnique.mockResolvedValue({
      role: {
        permissions: [{ permission: { code: 'vehicle-claim.review' } }],
      },
    });

    const result = await handler.execute({ id, workshopId, userId });

    expect(result.data.claimant).not.toBeNull();
    expect(prisma.workshopMember.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workshopId_userId: { workshopId, userId } },
      }),
    );
  });

  it('fallback de marca/modelo cuando no hay versión de catálogo', async () => {
    prisma.vehicleClaimInvite.findFirst.mockResolvedValue(
      invite({
        vehicle: {
          licensePlate: 'AB123CD',
          manufactureYear: null,
          brandName: 'Fiat',
          modelName: 'Cronos',
          version: null,
        },
      }),
    );
    withReviewPermission();

    const result = await handler.execute({ id, workshopId, userId });

    expect(result.data.vehicle).toEqual({
      licensePlate: 'AB123CD',
      brand: 'Fiat',
      model: 'Cronos',
      manufactureYear: null,
    });
  });

  it('estado efectivo expired cuando el invite abierto ya venció', async () => {
    prisma.vehicleClaimInvite.findFirst.mockResolvedValue(
      invite({ status: 'pending', expiresAt: new Date(Date.now() - 1000) }),
    );
    withReviewPermission();

    const result = await handler.execute({ id, workshopId, userId });

    expect(result.data.status).toBe('expired');
    expect(result.data.claimant).toBeNull();
  });
});
