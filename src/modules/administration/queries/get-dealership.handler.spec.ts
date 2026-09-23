import { NotFoundException } from '@nestjs/common';
import { GetDealershipHandler } from './get-dealership.handler';

describe('GetDealershipHandler — D-106 detalle admin dealership', () => {
  let handler: GetDealershipHandler;
  let prismaMock: { dealership: { findUnique: jest.Mock } };

  beforeEach(() => {
    prismaMock = {
      dealership: { findUnique: jest.fn() },
    };
    handler = new GetDealershipHandler(prismaMock as any);
  });

  it('mapea members con owner derivado del rol owner y la invitación vigente', async () => {
    prismaMock.dealership.findUnique.mockResolvedValue({
      id: 'd1',
      name: 'Concesionaria Norte',
      legalName: null,
      taxId: null,
      email: null,
      phone: null,
      website: null,
      logoUrl: null,
      description: null,
      status: 'pending_claim',
      isActive: true,
      claimedAt: null,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
      members: [
        {
          id: 'm1',
          userId: 'u1',
          joinedAt: new Date('2026-01-02T00:00:00Z'),
          status: 'active',
          user: {
            id: 'u1',
            firstName: 'Juan',
            lastName: 'Pérez',
            email: 'juan@example.com',
          },
          role: { id: 'r1', code: 'owner', name: 'Owner' },
        },
        {
          id: 'm2',
          userId: 'u2',
          joinedAt: new Date('2026-01-03T00:00:00Z'),
          status: 'active',
          user: {
            id: 'u2',
            firstName: 'Ana',
            lastName: 'Gómez',
            email: 'ana@example.com',
          },
          role: { id: 'r2', code: 'admin', name: 'Administrador' },
        },
      ],
      invitations: [
        {
          id: 'inv-1',
          email: 'juan@example.com',
          expiresAt: new Date('2026-02-01T00:00:00Z'),
          status: 'pending',
        },
      ],
    });

    const result = await handler.execute('d1');

    expect(prismaMock.dealership.findUnique).toHaveBeenCalledWith({
      where: { id: 'd1' },
      include: {
        members: {
          include: {
            user: {
              select: { id: true, firstName: true, lastName: true, email: true },
            },
            role: { select: { id: true, code: true, name: true } },
          },
        },
        invitations: {
          where: { status: { in: ['pending', 'accepted'] } },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    expect(result.owner).toEqual({
      id: 'u1',
      firstName: 'Juan',
      lastName: 'Pérez',
      email: 'juan@example.com',
    });
    expect(result.members).toHaveLength(2);
    expect(result.members[1].userName).toBe('Ana Gómez');
    expect(result.invitation).toEqual({
      id: 'inv-1',
      email: 'juan@example.com',
      expiresAt: expect.any(Date),
      status: 'pending',
    });
  });

  it('deja owner null cuando no hay miembro con rol owner y no expone token', async () => {
    prismaMock.dealership.findUnique.mockResolvedValue({
      id: 'd1',
      name: 'Concesionaria Sur',
      legalName: null,
      taxId: null,
      email: null,
      phone: null,
      website: null,
      logoUrl: null,
      description: null,
      status: 'pending_claim',
      isActive: true,
      claimedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      members: [],
      invitations: [
        {
          id: 'inv-2',
          email: 'dueno@example.com',
          expiresAt: new Date(),
          status: 'pending',
          token: 'token-secreto',
        },
      ],
    });

    const result = await handler.execute('d1');

    expect(result.owner).toBeNull();
    expect(result.members).toEqual([]);
    expect(JSON.stringify(result)).not.toContain('token-secreto');
  });

  it('lanza 404 cuando la dealership no existe', async () => {
    prismaMock.dealership.findUnique.mockResolvedValue(null);

    await expect(handler.execute('nope')).rejects.toThrow(NotFoundException);
  });
});