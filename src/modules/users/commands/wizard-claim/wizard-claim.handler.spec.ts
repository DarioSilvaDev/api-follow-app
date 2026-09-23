import { EventEmitter2 } from '@nestjs/event-emitter';
import { InvitationInvalidException } from '../../../../common/exceptions/coded.exception';
import { hashPasswordResetToken } from '../../../auth/utils/token-hash.util';
import { UserWizardClaimHandler } from './wizard-claim.handler';
import { UserWizardClaimCommand } from './wizard-claim.command';
import { UserWizardClaimDto } from '../../dto/user-wizard-claim.dto';

jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('hashed-password'),
}));

describe('UserWizardClaimHandler — D-106 claim wizard usuario plataforma', () => {
  let handler: UserWizardClaimHandler;
  let prismaMock: {
    userInvitation: { findUnique: jest.Mock; updateMany: jest.Mock };
    user: { findFirst: jest.Mock; create: jest.Mock; update: jest.Mock };
    systemRoleAssignment: {
      findUnique: jest.Mock;
      create: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let eventEmitterMock: { emit: jest.Mock };
  let permissionCacheMock: { invalidateUser: jest.Mock };

  const invitation = {
    id: 'inv-1',
    email: 'nuevo@example.com',
    tokenHash: hashPasswordResetToken('tok-1'),
    status: 'pending',
    expiresAt: new Date(Date.now() + 100000),
    roleId: 'role-admin',
    role: { id: 'role-admin', type: 'admin', name: 'Admin' },
  };

  const makeCommand = (overrides: Partial<UserWizardClaimDto> = {}) =>
    new UserWizardClaimCommand({
      token: 'tok-1',
      ...overrides,
    });

  const makeTxMock = () => ({
    userInvitation: { updateMany: jest.fn() },
    user: { create: jest.fn(), update: jest.fn() },
    systemRoleAssignment: { findUnique: jest.fn(), create: jest.fn() },
  });

  beforeEach(() => {
    prismaMock = {
      userInvitation: { findUnique: jest.fn(), updateMany: jest.fn() },
      user: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
      systemRoleAssignment: { findUnique: jest.fn(), create: jest.fn() },
      $transaction: jest.fn(),
    };
    eventEmitterMock = { emit: jest.fn() };
    permissionCacheMock = { invalidateUser: jest.fn() };
    handler = new UserWizardClaimHandler(
      prismaMock as any,
      eventEmitterMock as unknown as EventEmitter2,
      permissionCacheMock as any,
    );
  });

  it('404 si la invitación no existe', async () => {
    prismaMock.userInvitation.findUnique.mockResolvedValue(null);

    await expect(handler.execute(makeCommand())).rejects.toThrow(
      InvitationInvalidException,
    );
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('exige firstName/lastName/password para cuenta nueva (400 VALIDATION_ERROR)', async () => {
    prismaMock.userInvitation.findUnique.mockResolvedValue(invitation);
    prismaMock.user.findFirst.mockResolvedValue(null);

    await expect(handler.execute(makeCommand())).rejects.toMatchObject({
      status: 400,
      getCode: expect.any(Function),
    });
  });

  it('crea cuenta activa + rol y marca la invitación usada (email verificado)', async () => {
    prismaMock.userInvitation.findUnique.mockResolvedValue(invitation);
    prismaMock.user.findFirst.mockResolvedValue(null);

    const tx = makeTxMock();
    tx.userInvitation.updateMany.mockResolvedValue({ count: 1 });
    tx.user.create.mockResolvedValue({
      id: 'u1',
      email: 'nuevo@example.com',
      firstName: 'Nuevo',
      lastName: 'Usuario',
      phone: null,
      status: 'active',
    });
    tx.systemRoleAssignment.findUnique.mockResolvedValue(null);
    tx.systemRoleAssignment.create.mockResolvedValue({ id: 'a1' });
    prismaMock.$transaction.mockImplementation(
      async (cb: (t: typeof tx) => unknown) => cb(tx),
    );

    const result = await handler.execute(
      makeCommand({
        firstName: 'Nuevo',
        lastName: 'Usuario',
        password: 'password-seguro',
      }),
    );

    expect(prismaMock.userInvitation.findUnique).toHaveBeenCalledWith({
      where: { tokenHash: hashPasswordResetToken('tok-1') },
      include: { role: { select: { id: true, type: true, name: true } } },
    });

    expect(tx.userInvitation.updateMany).toHaveBeenCalledWith({
      where: { id: 'inv-1', status: 'pending' },
      data: { status: 'used', usedAt: expect.any(Date) },
    });
    expect(tx.user.create).toHaveBeenCalledWith({
      data: {
        email: 'nuevo@example.com',
        firstName: 'Nuevo',
        lastName: 'Usuario',
        phone: null,
        status: 'active',
        emailVerifiedAt: expect.any(Date),
        credential: { create: { passwordHash: 'hashed-password' } },
      },
    });
    expect(tx.systemRoleAssignment.create).toHaveBeenCalledWith({
      data: { userId: 'u1', roleId: 'role-admin' },
    });

    expect(permissionCacheMock.invalidateUser).toHaveBeenCalledWith('u1');
    expect(eventEmitterMock.emit).toHaveBeenCalledWith(
      'user.claimed',
      expect.objectContaining({ userId: 'u1', roleType: 'admin' }),
    );
    expect(eventEmitterMock.emit).toHaveBeenCalledWith(
      'auth.user.registered',
      expect.objectContaining({ userId: 'u1' }),
    );
    expect(result.role).toEqual({ type: 'admin', name: 'Admin' });
  });

  it('reactiva la cuenta pending y fija la credencial (upsert)', async () => {
    prismaMock.userInvitation.findUnique.mockResolvedValue(invitation);
    prismaMock.user.findFirst.mockResolvedValue({
      id: 'u1',
      email: 'nuevo@example.com',
      firstName: 'Previo',
      lastName: 'Pendiente',
      phone: '111',
      status: 'pending',
    });

    const tx = makeTxMock();
    tx.userInvitation.updateMany.mockResolvedValue({ count: 1 });
    tx.user.update.mockResolvedValue({
      id: 'u1',
      email: 'nuevo@example.com',
      firstName: 'Nuevo',
      lastName: 'Usuario',
      phone: '111',
      status: 'active',
    });
    tx.systemRoleAssignment.findUnique.mockResolvedValue(null);
    tx.systemRoleAssignment.create.mockResolvedValue({ id: 'a1' });
    prismaMock.$transaction.mockImplementation(
      async (cb: (t: typeof tx) => unknown) => cb(tx),
    );

    const result = await handler.execute(
      makeCommand({
        firstName: 'Nuevo',
        lastName: 'Usuario',
        password: 'password-seguro',
      }),
    );

    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: {
        firstName: 'Nuevo',
        lastName: 'Usuario',
        phone: '111',
        status: 'active',
        emailVerifiedAt: expect.any(Date),
        credential: {
          upsert: {
            create: { passwordHash: 'hashed-password' },
            update: { passwordHash: 'hashed-password' },
          },
        },
      },
    });
    expect(eventEmitterMock.emit).not.toHaveBeenCalledWith(
      'auth.user.registered',
      expect.anything(),
    );
    expect(result.user.status).toBe('active');
  });

  it('409 si ya existe una cuenta activa con este email', async () => {
    prismaMock.userInvitation.findUnique.mockResolvedValue(invitation);
    prismaMock.user.findFirst.mockResolvedValue({
      id: 'u1',
      email: 'nuevo@example.com',
      status: 'active',
    });

    await expect(
      handler.execute(
        makeCommand({
          firstName: 'Nuevo',
          lastName: 'Usuario',
          password: 'password-seguro',
        }),
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('409 si la cuenta está suspendida', async () => {
    prismaMock.userInvitation.findUnique.mockResolvedValue(invitation);
    prismaMock.user.findFirst.mockResolvedValue({
      id: 'u1',
      email: 'nuevo@example.com',
      status: 'suspended',
    });

    await expect(
      handler.execute(
        makeCommand({
          firstName: 'Nuevo',
          lastName: 'Usuario',
          password: 'password-seguro',
        }),
      ),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('409 D-S3 para cuenta soft-deleted con ese email', async () => {
    prismaMock.userInvitation.findUnique.mockResolvedValue(invitation);
    prismaMock.user.findFirst.mockResolvedValue({
      id: 'u1',
      email: 'nuevo@example.com',
      status: 'active',
      deletedAt: new Date(),
    });

    await expect(
      handler.execute(
        makeCommand({
          firstName: 'Nuevo',
          lastName: 'Usuario',
          password: 'password-seguro',
        }),
      ),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('NO asigna el rol si la cuenta ya lo tenía (unique userId+roleId)', async () => {
    prismaMock.userInvitation.findUnique.mockResolvedValue(invitation);
    prismaMock.user.findFirst.mockResolvedValue(null);

    const tx = makeTxMock();
    tx.userInvitation.updateMany.mockResolvedValue({ count: 1 });
    tx.user.create.mockResolvedValue({
      id: 'u1',
      email: 'nuevo@example.com',
      firstName: 'Nuevo',
      lastName: 'Usuario',
      phone: null,
      status: 'active',
    });
    tx.systemRoleAssignment.findUnique.mockResolvedValue({ id: 'existing' });
    prismaMock.$transaction.mockImplementation(
      async (cb: (t: typeof tx) => unknown) => cb(tx),
    );

    await handler.execute(
      makeCommand({
        firstName: 'Nuevo',
        lastName: 'Usuario',
        password: 'password-seguro',
      }),
    );

    expect(tx.systemRoleAssignment.create).not.toHaveBeenCalled();
  });
});
