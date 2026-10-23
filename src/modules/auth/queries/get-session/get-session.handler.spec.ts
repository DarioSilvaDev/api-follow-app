import { UnauthorizedException } from '@nestjs/common';
import { GetSessionHandler } from './get-session.handler';
import { RoleService } from '../../services/role.service';

describe('GetSessionHandler', () => {
  let handler: GetSessionHandler;
  let prismaMock: any;
  // Real RoleService: loadUserRoles() delegates to buildRoleDtos(), which is
  // pure, so this mounts the real mapping/ordering instead of a mock that would
  // prove nothing.
  let roleService: RoleService;

  beforeEach(() => {
    prismaMock = {
      user: { findUnique: jest.fn() },
      systemRoleAssignment: { findMany: jest.fn() },
    };
    prismaMock.systemRoleAssignment.findMany.mockResolvedValue(roleAssignments);
    roleService = new RoleService(prismaMock);
    handler = new GetSessionHandler(prismaMock, roleService);
  });

  // Deliberadamente desordenadas: la salida debe quedar por `priority desc`.
  const roleAssignments = [
    {
      role: {
        id: 'role-owner',
        type: 'owner',
        name: 'Owner',
        priority: 10,
        permissions: [{ permission: { code: 'vehicle:read' } }],
      },
    },
    {
      role: {
        id: 'role-super',
        type: 'super_admin',
        name: 'Super Admin',
        priority: 100,
        permissions: [],
      },
    },
  ];

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
  });

  it('roles: ordenados por priority desc y mapeados con RoleDto (super_admin => ["*"])', async () => {
    prismaMock.user.findUnique.mockResolvedValue(userRow);
    prismaMock.systemRoleAssignment.findMany.mockResolvedValue(roleAssignments);

    const result = await handler.execute('user-1');

    expect(result.roles).toEqual([
      {
        id: 'role-super',
        type: 'super_admin',
        name: 'Super Admin',
        permissions: ['*'],
      },
      {
        id: 'role-owner',
        type: 'owner',
        name: 'Owner',
        permissions: ['vehicle:read'],
      },
    ]);
  });

  it('no filtra el grafo interno: sin systemRoleAssignments ni _count en la respuesta', async () => {
    prismaMock.user.findUnique.mockResolvedValue(userRow);

    const result = await handler.execute('user-1');

    expect(result).not.toHaveProperty('systemRoleAssignments');
    expect(result).not.toHaveProperty('_count');
    // Campos públicos preservados.
    expect(result).toMatchObject({
      id: 'user-1',
      email: 'a@example.com',
      firstName: 'A',
      lastName: 'B',
      alias: 'a',
      avatarUrl: null,
      language: 'es',
      status: 'active',
      workshopMemberships: [],
    });
  });

  it('isVehicleOwner=false cuando el usuario no tiene ownerships activas', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      ...userRow,
      _count: { ownerships: 0 },
    });

    const result = await handler.execute('user-1');

    expect(result.isVehicleOwner).toBe(false);
  });

  it('preserva los filtros de integridad en la query (endsAt:null, active/leftAt:null) y carga roles aparte', async () => {
    prismaMock.user.findUnique.mockResolvedValue(userRow);

    await handler.execute('user-1');

    const arg = prismaMock.user.findUnique.mock.calls[0][0];
    expect(arg.select._count.select.ownerships.where).toEqual({ endsAt: null });
    expect(arg.select.workshopMemberships.where).toEqual({
      status: 'active',
      leftAt: null,
    });
    expect(arg.select.dealershipMemberships.where).toEqual({
      status: 'active',
      leftAt: null,
    });
    // El plegado fue removido: los roles NO viajan en el findUnique del perfil.
    expect(arg.select.systemRoleAssignments).toBeUndefined();
    // Roles cargados vía RoleService en una consulta separada.
    expect(prismaMock.user.findUnique).toHaveBeenCalledTimes(1);
    expect(prismaMock.systemRoleAssignment.findMany).toHaveBeenCalledTimes(1);
  });

  it('carga los roles del usuario con el userId y las permissions incluidas', async () => {
    prismaMock.user.findUnique.mockResolvedValue(userRow);

    await handler.execute('user-1');

    const arg = prismaMock.systemRoleAssignment.findMany.mock.calls[0][0];
    expect(arg.where).toEqual({ userId: 'user-1' });
    expect(arg.include.role.include).toHaveProperty('permissions');
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

  it('impersonación: propaga impersonated/impersonatedBy y no los agrega si no aplica', async () => {
    prismaMock.user.findUnique.mockResolvedValue(userRow);

    const impersonated = await handler.execute('user-1', {
      impersonated: true,
      impersonatedBy: 'admin-1',
    });
    expect(impersonated.impersonated).toBe(true);
    expect(impersonated.impersonatedBy).toBe('admin-1');

    const normal = await handler.execute('user-1', {});
    expect(normal).not.toHaveProperty('impersonated');
    expect(normal).not.toHaveProperty('impersonatedBy');
  });
});
