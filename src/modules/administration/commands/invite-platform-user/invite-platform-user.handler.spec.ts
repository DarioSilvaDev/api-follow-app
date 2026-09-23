import { EventEmitter2 } from '@nestjs/event-emitter';
import { NotFoundException } from '@nestjs/common';
import { InvitePlatformUserHandler } from './invite-platform-user.handler';
import { InvitePlatformUserCommand } from './invite-platform-user.command';
import { InvitePlatformUserDto } from '../../dto/invite-platform-user.dto';

describe('InvitePlatformUserHandler — D-106 invitación de usuario plataforma', () => {
  let handler: InvitePlatformUserHandler;
  let prismaMock: {
    systemRole: { findUnique: jest.Mock };
    user: { findFirst: jest.Mock };
    systemRoleAssignment: {
      findUnique: jest.Mock;
      create: jest.Mock;
    };
    userInvitation: {
      findFirst: jest.Mock;
      create: jest.Mock;
    };
  };
  let eventEmitterMock: { emit: jest.Mock };
  let permissionCacheMock: { invalidateUser: jest.Mock };

  const role = { id: 'role-admin', type: 'admin', name: 'Admin' };

  const makeCommand = (overrides: Partial<InvitePlatformUserDto> = {}) =>
    new InvitePlatformUserCommand(
      {
        email: 'nuevo@example.com',
        roleType: 'admin',
        ...overrides,
      },
      'admin-1',
    );

  beforeEach(() => {
    prismaMock = {
      systemRole: { findUnique: jest.fn() },
      user: { findFirst: jest.fn() },
      systemRoleAssignment: { findUnique: jest.fn(), create: jest.fn() },
      userInvitation: { findFirst: jest.fn(), create: jest.fn() },
    };
    eventEmitterMock = { emit: jest.fn() };
    permissionCacheMock = { invalidateUser: jest.fn() };
    handler = new InvitePlatformUserHandler(
      prismaMock as any,
      eventEmitterMock as unknown as EventEmitter2,
      permissionCacheMock as any,
    );
  });

  it('404 si el rol de sistema no existe', async () => {
    prismaMock.systemRole.findUnique.mockResolvedValue(null);

    await expect(
      handler.execute(makeCommand({ roleType: 'support' })),
    ).rejects.toThrow(NotFoundException);
  });

  it('crea la invitación para un email sin cuenta y NUNCA expone el token', async () => {
    prismaMock.systemRole.findUnique.mockResolvedValue(role);
    prismaMock.user.findFirst.mockResolvedValue(null);
    prismaMock.userInvitation.findFirst.mockResolvedValue(null);
    prismaMock.userInvitation.create.mockResolvedValue({
      id: 'inv-1',
      email: 'nuevo@example.com',
      expiresAt: new Date(),
      status: 'pending',
    });

    const result = await handler.execute(makeCommand());

    const created = prismaMock.userInvitation.create.mock.calls[0][0].data;
    expect(created).toEqual(
      expect.objectContaining({
        email: 'nuevo@example.com',
        roleId: 'role-admin',
        invitedById: 'admin-1',
        status: 'pending',
        expiresAt: expect.any(Date),
      }),
    );
    expect(created.tokenHash).toMatch(/^[a-f0-9]{64}$/);

    expect(result.roleAssigned).toBe(false);
    expect(result.user).toBeNull();
    expect(result.invitation).toEqual({
      id: 'inv-1',
      email: 'nuevo@example.com',
      expiresAt: expect.any(Date),
      status: 'pending',
    });

    // El token solo viaja en el evento (para el mail), nunca en la respuesta.
    const event = eventEmitterMock.emit.mock.calls[0][1];
    expect(event.token).toBeDefined();
    expect(JSON.stringify(result)).not.toContain(event.token);
    expect(eventEmitterMock.emit).toHaveBeenCalledWith(
      'user.invited',
      expect.objectContaining({ email: 'nuevo@example.com' }),
    );
  });

  it('asigna el rol directo (sin invitación) cuando la cuenta está activa sin rol', async () => {
    prismaMock.systemRole.findUnique.mockResolvedValue(role);
    prismaMock.user.findFirst.mockResolvedValue({
      id: 'u1',
      email: 'nuevo@example.com',
      firstName: 'Ana',
      lastName: 'Gómez',
      status: 'active',
      deletedAt: null,
    });
    prismaMock.systemRoleAssignment.findUnique.mockResolvedValue(null);
    prismaMock.systemRoleAssignment.create.mockResolvedValue({ id: 'a1' });

    const result = await handler.execute(makeCommand());

    expect(prismaMock.systemRoleAssignment.create).toHaveBeenCalledWith({
      data: { userId: 'u1', roleId: 'role-admin' },
    });
    expect(prismaMock.userInvitation.create).not.toHaveBeenCalled();
    expect(permissionCacheMock.invalidateUser).toHaveBeenCalledWith('u1');
    expect(eventEmitterMock.emit).toHaveBeenCalledWith(
      'admin.system_role.assigned',
      expect.objectContaining({ userId: 'u1', roleType: 'admin' }),
    );
    expect(result.roleAssigned).toBe(true);
    expect(result.invitation).toBeNull();
  });

  it('409 CONFLICT si la cuenta activa ya tiene el rol', async () => {
    prismaMock.systemRole.findUnique.mockResolvedValue(role);
    prismaMock.user.findFirst.mockResolvedValue({
      id: 'u1',
      email: 'nuevo@example.com',
      firstName: 'Ana',
      lastName: 'Gómez',
      status: 'active',
      deletedAt: null,
    });
    prismaMock.systemRoleAssignment.findUnique.mockResolvedValue({ id: 'a1' });

    await expect(handler.execute(makeCommand())).rejects.toMatchObject({
      status: 409,
    });
    expect(prismaMock.systemRoleAssignment.create).not.toHaveBeenCalled();
    expect(prismaMock.userInvitation.create).not.toHaveBeenCalled();
    expect(eventEmitterMock.emit).not.toHaveBeenCalled();
  });

  it('409 CONFLICT si la cuenta está suspendida', async () => {
    prismaMock.systemRole.findUnique.mockResolvedValue(role);
    prismaMock.user.findFirst.mockResolvedValue({
      id: 'u1',
      email: 'nuevo@example.com',
      firstName: 'Ana',
      lastName: 'Gómez',
      status: 'suspended',
      deletedAt: null,
    });

    await expect(handler.execute(makeCommand())).rejects.toMatchObject({
      status: 409,
    });
    expect(prismaMock.userInvitation.create).not.toHaveBeenCalled();
  });

  it('409 CONFLICT D-S3 para una cuenta soft-deleted', async () => {
    prismaMock.systemRole.findUnique.mockResolvedValue(role);
    prismaMock.user.findFirst.mockResolvedValue({
      id: 'u1',
      email: 'nuevo@example.com',
      firstName: 'Ana',
      lastName: 'Gómez',
      status: 'active',
      deletedAt: new Date(),
    });

    await expect(handler.execute(makeCommand())).rejects.toMatchObject({
      status: 409,
    });
  });

  it('409 CONFLICT si ya existe una invitación pending vigente (dedupe)', async () => {
    prismaMock.systemRole.findUnique.mockResolvedValue(role);
    prismaMock.user.findFirst.mockResolvedValue(null);
    prismaMock.userInvitation.findFirst.mockResolvedValue({ id: 'inv-old' });

    await expect(handler.execute(makeCommand())).rejects.toMatchObject({
      status: 409,
    });
    expect(prismaMock.userInvitation.create).not.toHaveBeenCalled();
    expect(eventEmitterMock.emit).not.toHaveBeenCalled();
  });

  it('normaliza el email a lowercase en la invitación', async () => {
    prismaMock.systemRole.findUnique.mockResolvedValue(role);
    prismaMock.user.findFirst.mockResolvedValue(null);
    prismaMock.userInvitation.findFirst.mockResolvedValue(null);
    prismaMock.userInvitation.create.mockResolvedValue({
      id: 'inv-1',
      email: 'nuevo@example.com',
      expiresAt: new Date(),
      status: 'pending',
    });

    await handler.execute(makeCommand({ email: 'Nuevo@Example.COM' }));

    const data = prismaMock.userInvitation.create.mock.calls[0][0].data;
    expect(data.email).toBe('nuevo@example.com');
  });
});
