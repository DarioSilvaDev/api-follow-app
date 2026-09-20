import { Logger } from '@nestjs/common';
import { WorkshopInvitationEmailListener } from './workshop-invitation-email.listener';
import { MemberInvitedEvent } from '../events/member-invited.event';

describe('WorkshopInvitationEmailListener — D-106 mail del wizard de taller', () => {
  let listener: WorkshopInvitationEmailListener;
  let prismaMock: {
    workshop: { findUnique: jest.Mock };
  };
  let mailServiceMock: {
    sendWorkshopInvitationEmail: jest.Mock;
  };

  beforeEach(() => {
    prismaMock = {
      workshop: { findUnique: jest.fn() },
    };
    mailServiceMock = {
      sendWorkshopInvitationEmail: jest.fn(),
    };
    listener = new WorkshopInvitationEmailListener(
      prismaMock as any,
      mailServiceMock as any,
    );
  });

  it('envía el mail al dueño con FRONTEND_URL + token + nombre cuando el taller está pending_claim', async () => {
    // MemberInvitedEvent no transporta el nombre del taller: el listener lo
    // resuelve de la BD y guarda que el taller siga pending_claim.
    prismaMock.workshop.findUnique.mockResolvedValue({
      id: 'w1',
      status: 'pending_claim',
      name: 'Taller Norte',
    });

    await listener.handle(
      new MemberInvitedEvent('w1', 'dueno@example.com', 'token-abcd'),
    );

    expect(prismaMock.workshop.findUnique).toHaveBeenCalledWith({
      where: { id: 'w1' },
      select: { id: true, status: true, name: true },
    });
    expect(
      mailServiceMock.sendWorkshopInvitationEmail,
    ).toHaveBeenCalledTimes(1);
    const [to, name, token] =
      mailServiceMock.sendWorkshopInvitationEmail.mock.calls[0];
    expect(to).toBe('dueno@example.com');
    expect(name).toBe('Taller Norte');
    expect(token).toBe('token-abcd');
  });

  it('NO envía mail para invitaciones regulares (taller ya activo)', async () => {
    prismaMock.workshop.findUnique.mockResolvedValue({
      id: 'w1',
      status: 'active',
      name: 'Taller Norte',
    });

    await listener.handle(
      new MemberInvitedEvent('w1', 'miembro@example.com', 'token-abcd'),
    );

    expect(
      mailServiceMock.sendWorkshopInvitationEmail,
    ).not.toHaveBeenCalled();
  });

  it('no falla si el taller no existe', async () => {
    prismaMock.workshop.findUnique.mockResolvedValue(null);

    await expect(
      listener.handle(
        new MemberInvitedEvent('w-missing', 'a@b.com', 'tok'),
      ),
    ).resolves.toBeUndefined();
    expect(
      mailServiceMock.sendWorkshopInvitationEmail,
    ).not.toHaveBeenCalled();
  });

  it('no tumba el proceso si el envío de mail falla (SC-1): loguea con workshopId y NUNCA el token', async () => {
    prismaMock.workshop.findUnique.mockResolvedValue({
      id: 'w1',
      status: 'pending_claim',
      name: 'Taller Norte',
    });
    mailServiceMock.sendWorkshopInvitationEmail.mockRejectedValue(
      new Error('SMTP connection refused'),
    );
    const loggerSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    try {
      await expect(
        listener.handle(
          new MemberInvitedEvent('w1', 'dueno@example.com', 'token-secreto'),
        ),
      ).resolves.toBeUndefined();

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('workshopId=w1'),
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