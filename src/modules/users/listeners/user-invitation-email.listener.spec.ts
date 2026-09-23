import { Logger } from '@nestjs/common';
import { UserInvitationEmailListener } from './user-invitation-email.listener';
import { UserInvitedEvent } from '../events/user-invited.event';

describe('UserInvitationEmailListener — D-106 mail de invitación plataforma', () => {
  let listener: UserInvitationEmailListener;
  let mailServiceMock: { sendUserInvitationEmail: jest.Mock };

  beforeEach(() => {
    mailServiceMock = { sendUserInvitationEmail: jest.fn() };
    listener = new UserInvitationEmailListener(mailServiceMock as any);
  });

  it('envía el mail con email, rol y token (el link lo construye MailService)', async () => {
    await listener.handle(
      new UserInvitedEvent('nuevo@example.com', 'token-abcd', 'admin', 'Admin'),
    );

    expect(mailServiceMock.sendUserInvitationEmail).toHaveBeenCalledTimes(1);
    const [to, roleName, token] =
      mailServiceMock.sendUserInvitationEmail.mock.calls[0];
    expect(to).toBe('nuevo@example.com');
    expect(roleName).toBe('Admin');
    expect(token).toBe('token-abcd');
  });

  it('no tumba el proceso si el mail falla (SC-1): loguea email enmascarado y NUNCA el token', async () => {
    mailServiceMock.sendUserInvitationEmail.mockRejectedValue(
      new Error('SMTP connection refused'),
    );
    const loggerSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    try {
      await expect(
        listener.handle(
          new UserInvitedEvent(
            'nuevo@example.com',
            'token-secreto',
            'support',
            'Support',
          ),
        ),
      ).resolves.toBeUndefined();

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('email=nu***@example.com'),
        expect.anything(),
      );
      for (const call of loggerSpy.mock.calls) {
        expect(JSON.stringify(call)).not.toContain('token-secreto');
      }
    } finally {
      loggerSpy.mockRestore();
    }
  });
});
