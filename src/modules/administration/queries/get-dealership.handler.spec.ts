import { NotFoundException } from '@nestjs/common';
import { GetDealershipHandler } from './get-dealership.handler';
import { DealershipDetailAdminResponseDto } from '../dto/dealership-detail-response.dto';

describe('GetDealershipHandler — D-106 detalle admin dealership', () => {
  let handler: GetDealershipHandler;
  let prismaMock: { dealership: { findUnique: jest.Mock } };

  beforeEach(() => {
    prismaMock = {
      dealership: { findUnique: jest.fn() },
    };
    handler = new GetDealershipHandler(prismaMock as any);
  });

  it('consulta members con user+role y la última invitación vigente', async () => {
    prismaMock.dealership.findUnique.mockResolvedValue({
      id: 'd1',
      members: [],
      invitations: [],
    });

    await handler.execute('d1');

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
  });

  it('D-TL-20: devuelve la entidad RAW (sin mapear) — el mapeo lo hace el controller una sola vez', async () => {
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

    // Raw: members conservan user/role anidados (la causa del bug era el
    // doble mapeo que degradaba estos objetos a fallbacks del DTO).
    expect(result.members).toHaveLength(2);
    expect(result.members[1].user.firstName).toBe('Ana');
    expect(result.members[1].user.lastName).toBe('Gómez');
    expect(result.members[1].role.code).toBe('admin');
    expect(result.members[1].role.name).toBe('Administrador');
    expect(result.members[0].role.code).toBe('owner');
    expect(result.invitations?.[0]?.status).toBe('pending');
    // No existe propiedad derivada en el raw: la deriva el DTO.
    expect(result).not.toHaveProperty('owner');
    expect(result).not.toHaveProperty('invitation');
  });

  it('el DTO mapeado una sola vez deriva owner y NO expone el token (contrato HTTP)', async () => {
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
      members: [
        {
          id: 'm1',
          userId: 'u1',
          joinedAt: new Date(),
          status: 'active',
          user: {
            id: 'u1',
            firstName: 'Juan',
            lastName: 'Pérez',
            email: 'juan@example.com',
          },
          role: { id: 'r1', code: 'owner', name: 'Owner' },
        },
      ],
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

    const raw = await handler.execute('d1');
    const dto = DealershipDetailAdminResponseDto.from(raw);

    expect(dto.owner).toEqual({
      id: 'u1',
      firstName: 'Juan',
      lastName: 'Pérez',
      email: 'juan@example.com',
    });
    expect(dto.members[0].userName).toBe('Juan Pérez');
    expect(dto.members[0].userEmail).toBe('juan@example.com');
    expect(dto.members[0].roleCode).toBe('owner');
    expect(dto.invitation).toEqual({
      id: 'inv-2',
      email: 'dueno@example.com',
      expiresAt: expect.any(Date),
      status: 'pending',
    });
    expect(JSON.stringify(dto)).not.toContain('token-secreto');
  });

  it('lanza 404 cuando la dealership no existe', async () => {
    prismaMock.dealership.findUnique.mockResolvedValue(null);

    await expect(handler.execute('nope')).rejects.toThrow(NotFoundException);
  });
});