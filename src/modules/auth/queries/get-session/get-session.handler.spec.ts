import { UnauthorizedException } from '@nestjs/common';
import { GetSessionHandler } from './get-session.handler';

describe('GetSessionHandler', () => {
  let handler: GetSessionHandler;
  let prismaMock: any;
  let roleServiceMock: { loadUserRoles: jest.Mock };

  beforeEach(() => {
    prismaMock = {
      user: { findUnique: jest.fn() },
    };
    roleServiceMock = {
      loadUserRoles: jest.fn().mockResolvedValue(['ROLE_OWNER']),
    };
    handler = new GetSessionHandler(prismaMock, roleServiceMock as any);
  });

  const userRow = {
    id: 'user-1',
    email: 'a@example.com',
    firstName: 'A',
    lastName: 'B',
    alias: 'a',
    avatarUrl: null,
    language: 'es',
    status: 'active',
    _count: { ownerships: 1 },
    workshopMemberships: [],
    dealershipMemberships: [
      {
        dealershipId: 'dealership-1',
        dealership: {
          id: 'dealership-1',
          name: 'AutoMax',
          logoUrl: 'https://cdn.example/logo.png',
        },
        role: { id: 'role-1', code: 'owner', name: 'Owner' },
      },
    ],
  };

  it('§28 §3.4: expone dealershipMemberships con shape público (dealershipName + role)', async () => {
    prismaMock.user.findUnique.mockResolvedValue(userRow);

    const result = await handler.execute('user-1');

    expect(result.dealershipMemberships).toEqual([
      {
        dealershipId: 'dealership-1',
        dealershipName: 'AutoMax',
        logoUrl: 'https://cdn.example/logo.png',
        role: { id: 'role-1', code: 'owner', name: 'Owner' },
      },
    ]);
    // El grafo anidado `dealership` es interno de Prisma, no se filtra al API.
    expect(result.dealershipMemberships[0]).not.toHaveProperty('dealerships');
    expect(result).not.toHaveProperty('dealerships');
    expect(result.isVehicleOwner).toBe(true);
    expect(result.roles).toEqual(['ROLE_OWNER']);
  });

  it('dealershipMemberships vacío cuando el usuario no pertenece a ninguna dealership', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      ...userRow,
      dealershipMemberships: [],
    });

    const result = await handler.execute('user-1');

    expect(result.dealershipMemberships).toEqual([]);
  });

  it('requiere un usuario autenticado existente', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);

    let thrown: any;
    try {
      await handler.execute('user-1');
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(UnauthorizedException);
  });
});