import { Logger } from '@nestjs/common';
import { DealershipInvitationEmailListener } from './dealership-invitation-email.listener';
import { MemberInvitedEvent } from '../events/member-invited.event';

describe('DealershipInvitationEmailListener — D-106 mail del wizard', () => {
  let listener: DealershipInvitationEmailListener;
  let prismaMock: {
    dealership: { findUnique: jest.Mock };
  };
  let mailServiceMock: {
    sendDealershipInvitationEmail: jest.Mock;
  };

  beforeEach(() => {
    prismaMock = {
      dealership: { findUnique: jest.fn() },
    };
    mailServiceMock = {
      sendDealershipInvitationEmail: jest.fn(),
    };
    listener = new DealershipInvitationEmailListener(
      prismaMock as any,
      mailServiceMock as any,
    );
  });

  it('envía el mail al dueño con FRONTEND_URL + token + nombre cuando la dealership está pending_claim', async () => {
    prismaMock.dealership.findUnique.mockResolvedValue({
      id: 'd1',
      status: 'pending_claim',
    });

    await listener.handle(
      new MemberInvitedEvent(
        'd1',
        'dueno@example.com',
        'token-abcd',
        'Concesionaria Norte',
      ),
    );

    expect(prismaMock.dealership.findUnique).toHaveBeenCalledWith({
      where: { id: 'd1' },
      select: { id: true, status: true },
    });
    expect(mailServiceMock.sendDealershipInvitationEmail).toHaveBeenCalledTimes(
      1,
    );
    const [to, name, token] =
      mailServiceMock.sendDealershipInvitationEmail.mock.calls[0];
    expect(to).toBe('dueno@example.com');
    expect(name).toBe('Concesionaria Norte');
    expect(token).toBe('token-abcd');
    // el método del MailService construye `${FRONTEND_URL}/invitations/{token}`.
    expect(token).toEqual(expect.stringMatching(/^token-/));
  });

  it('NO envía mail para invitaciones regulares (dealership ya activa)', async () => {
    prismaMock.dealership.findUnique.mockResolvedValue({
      id: 'd1',
      status: 'active',
    });

    await listener.handle(
      new MemberInvitedEvent(
        'd1',
        'miembro@example.com',
        'token-abcd',
        'Concesionaria Norte',
      ),
    );

    expect(
      mailServiceMock.sendDealershipInvitationEmail,
    ).not.toHaveBeenCalled();
  });

  it('no falla si la dealership no existe', async () => {
    prismaMock.dealership.findUnique.mockResolvedValue(null);

    await expect(
      listener.handle(
        new MemberInvitedEvent('d-missing', 'a@b.com', 'tok', 'X'),
      ),
    ).resolves.toBeUndefined();
    expect(
      mailServiceMock.sendDealershipInvitationEmail,
    ).not.toHaveBeenCalled();
  });

  it('no tumba el proceso si el envío de mail falla (SC-1): loguea con dealershipId y NUNCA el token', async () => {
    prismaMock.dealership.findUnique.mockResolvedValue({
      id: 'd1',
      status: 'pending_claim',
    });
    mailServiceMock.sendDealershipInvitationEmail.mockRejectedValue(
      new Error('SMTP connection refused'),
    );
    const loggerSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    try {
      await expect(
        listener.handle(
          new MemberInvitedEvent(
            'd1',
            'dueno@example.com',
            'token-secreto',
            'Concesionaria Norte',
          ),
        ),
      ).resolves.toBeUndefined();

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('dealershipId=d1'),
        expect.anything(),
      );
      // SC-1: el token de invitación jamás se escribe en los logs.
      for (const call of loggerSpy.mock.calls) {
        expect(JSON.stringify(call)).not.toContain('token-secreto');
      }
    } finally {
      loggerSpy.mockRestore();
    }
  });
});
