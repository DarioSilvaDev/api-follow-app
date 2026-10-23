import { Logger } from '@nestjs/common';
import { DealershipInvitationEmailListener } from './dealership-invitation-email.listener';
import { MemberInvitedEvent } from '../events/member-invited.event';

describe('DealershipInvitationEmailListener — D-106 mail del wizard', () => {
  let listener: DealershipInvitationEmailListener;
  let prismaMock: {
    dealership: { findUnique: jest.Mock };
    workshop: { findFirst: jest.Mock };
  };
  let mailServiceMock: {
    sendDealershipInvitationEmail: jest.Mock;
    sendDealershipGroupInvitationEmail: jest.Mock;
  };

  beforeEach(() => {
    prismaMock = {
      dealership: { findUnique: jest.fn() },
      workshop: { findFirst: jest.fn() },
    };
    mailServiceMock = {
      sendDealershipInvitationEmail: jest.fn(),
      sendDealershipGroupInvitationEmail: jest.fn(),
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
      name: 'Concesionaria Norte',
    });
    // Sin taller vinculado → template actual (D-TL-4/5).
    prismaMock.workshop.findFirst.mockResolvedValue(null);

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
      select: { id: true, status: true, name: true },
    });
    expect(prismaMock.workshop.findFirst).toHaveBeenCalledWith({
      where: { dealershipId: 'd1' },
      select: { id: true, name: true },
    });
    expect(mailServiceMock.sendDealershipInvitationEmail).toHaveBeenCalledTimes(
      1,
    );
    expect(
      mailServiceMock.sendDealershipGroupInvitationEmail,
    ).not.toHaveBeenCalled();
    const [to, name, token] =
      mailServiceMock.sendDealershipInvitationEmail.mock.calls[0];
    expect(to).toBe('dueno@example.com');
    expect(name).toBe('Concesionaria Norte');
    expect(token).toBe('token-abcd');
    // el método del MailService construye
    // `${FRONTEND_URL}/invitations/{token}?kind=dealership`
    // (assert del link completo en mail.service.spec.ts).
    expect(token).toEqual(expect.stringMatching(/^token-/));
  });

  it('D-TL-5: con taller vinculado envía la variante COMBINADA (concesionaria + taller) y no la simple', async () => {
    prismaMock.dealership.findUnique.mockResolvedValue({
      id: 'd1',
      status: 'pending_claim',
      name: 'Concesionaria Norte',
    });
    prismaMock.workshop.findFirst.mockResolvedValue({
      id: 'w1',
      name: 'Concesionaria Norte Service',
    });

    await listener.handle(
      new MemberInvitedEvent(
        'd1',
        'dueno@example.com',
        'token-abcd',
        'Concesionaria Norte',
      ),
    );

    expect(
      mailServiceMock.sendDealershipGroupInvitationEmail,
    ).toHaveBeenCalledTimes(1);
    expect(
      mailServiceMock.sendDealershipInvitationEmail,
    ).not.toHaveBeenCalled();
    const [to, dealershipName, workshopName, token, context] =
      mailServiceMock.sendDealershipGroupInvitationEmail.mock.calls[0];
    expect(to).toBe('dueno@example.com');
    expect(dealershipName).toBe('Concesionaria Norte');
    expect(workshopName).toBe('Concesionaria Norte Service');
    expect(token).toBe('token-abcd');
    expect(context).toEqual({ dealershipId: 'd1', workshopId: 'w1' });
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
    expect(
      mailServiceMock.sendDealershipGroupInvitationEmail,
    ).not.toHaveBeenCalled();
    expect(prismaMock.workshop.findFirst).not.toHaveBeenCalled();
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
    expect(prismaMock.workshop.findFirst).not.toHaveBeenCalled();
  });

  it('no tumba el proceso si el envío de mail falla (SC-1): loguea con dealershipId y NUNCA el token', async () => {
    prismaMock.dealership.findUnique.mockResolvedValue({
      id: 'd1',
      status: 'pending_claim',
      name: 'Concesionaria Norte',
    });
    prismaMock.workshop.findFirst.mockResolvedValue(null);
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
