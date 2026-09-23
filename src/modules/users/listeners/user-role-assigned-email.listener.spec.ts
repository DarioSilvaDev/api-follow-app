import { Logger } from '@nestjs/common';
import { UserRoleAssignedEmailListener } from './user-role-assigned-email.listener';
import { SystemRoleAssignedEvent } from '../../administration/events/system-role-assigned.event';

describe('UserRoleAssignedEmailListener — D-106 mail rol asignado a cuenta activa', () => {
  let listener: UserRoleAssignedEmailListener;
  let prismaMock: {
    user: { findUnique: jest.Mock };
    systemRole: { findUnique: jest.Mock };
  };
  let mailServiceMock: { sendUserRoleAssignedEmail: jest.Mock };

  beforeEach(() => {
    prismaMock = {
      user: { findUnique: jest.fn() },
      systemRole: { findUnique: jest.fn() },
    };
    mailServiceMock = { sendUserRoleAssignedEmail: jest.fn() };
    listener = new UserRoleAssignedEmailListener(
      prismaMock as any,
      mailServiceMock as any,
    );
  });

  it('envía mail solo para roles de plataforma admin|support', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      email: 'nuevo@example.com',
      deletedAt: null,
    });
    prismaMock.systemRole.findUnique.mockResolvedValue({ name: 'Admin' });

    await listener.handle(new SystemRoleAssignedEvent('u1', 'admin'));

    expect(mailServiceMock.sendUserRoleAssignedEmail).toHaveBeenCalledWith(
      'nuevo@example.com',
      'Admin',
    );
  });

  it('NO envía mail para super_admin ni user (comportamiento previo preservado)', async () => {
    await listener.handle(new SystemRoleAssignedEvent('u1', 'super_admin'));
    await listener.handle(new SystemRoleAssignedEvent('u2', 'user'));

    expect(mailServiceMock.sendUserRoleAssignedEmail).not.toHaveBeenCalled();
  });

  it('NO envía mail si la cuenta no existe o está soft-deleted', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);

    await listener.handle(new SystemRoleAssignedEvent('u1', 'admin'));

    prismaMock.user.findUnique.mockResolvedValue({
      email: 'y@example.com',
      deletedAt: new Date(),
    });
    await listener.handle(new SystemRoleAssignedEvent('u2', 'support'));

    expect(mailServiceMock.sendUserRoleAssignedEmail).not.toHaveBeenCalled();
  });

  it('no tumba el proceso si el mail falla (SC-1), y loguea userId/roleType sin credenciales', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      email: 'nuevo@example.com',
      deletedAt: null,
    });
    prismaMock.systemRole.findUnique.mockResolvedValue({ name: 'Support' });
    mailServiceMock.sendUserRoleAssignedEmail.mockRejectedValue(
      new Error('SMTP refused'),
    );
    const loggerSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    try {
      await expect(
        listener.handle(new SystemRoleAssignedEvent('u1', 'support')),
      ).resolves.toBeUndefined();

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('userId=u1, roleType=support'),
        expect.anything(),
      );
    } finally {
      loggerSpy.mockRestore();
    }
  });
});
