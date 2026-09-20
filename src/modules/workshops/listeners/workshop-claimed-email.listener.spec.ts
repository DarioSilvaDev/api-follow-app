import { Logger } from '@nestjs/common';
import { WorkshopClaimedEmailListener } from './workshop-claimed-email.listener';
import { WorkshopClaimedEvent } from '../events/workshop-claimed.event';

describe('WorkshopClaimedEmailListener — D-106 mail de confirmación', () => {
  let listener: WorkshopClaimedEmailListener;
  let prismaMock: {
    workshop: { findUnique: jest.Mock };
  };
  let mailServiceMock: {
    sendWorkshopClaimedEmail: jest.Mock;
  };

  beforeEach(() => {
    prismaMock = {
      workshop: { findUnique: jest.fn() },
    };
    mailServiceMock = {
      sendWorkshopClaimedEmail: jest.fn(),
    };
    listener = new WorkshopClaimedEmailListener(
      prismaMock as any,
      mailServiceMock as any,
    );
  });

  it('envía la confirmación al dueño cuando el taller quedó activo', async () => {
    prismaMock.workshop.findUnique.mockResolvedValue({
      id: 'w1',
      name: 'Taller Norte',
    });

    await listener.handle(
      new WorkshopClaimedEvent('w1', 'u1', 'dueno@example.com'),
    );

    expect(prismaMock.workshop.findUnique).toHaveBeenCalledWith({
      where: { id: 'w1' },
      select: { id: true, name: true },
    });
    expect(mailServiceMock.sendWorkshopClaimedEmail).toHaveBeenCalledTimes(1);
    const [to, name] = mailServiceMock.sendWorkshopClaimedEmail.mock.calls[0];
    expect(to).toBe('dueno@example.com');
    expect(name).toBe('Taller Norte');
  });

  it('no envía mail si el taller no existe', async () => {
    prismaMock.workshop.findUnique.mockResolvedValue(null);

    await expect(
      listener.handle(
        new WorkshopClaimedEvent('w-missing', 'u1', 'a@b.com'),
      ),
    ).resolves.toBeUndefined();
    expect(mailServiceMock.sendWorkshopClaimedEmail).not.toHaveBeenCalled();
  });

  it('no tumba el proceso si el envío de mail falla (SC-1): loguea con workshopId', async () => {
    prismaMock.workshop.findUnique.mockResolvedValue({
      id: 'w1',
      name: 'Taller Norte',
    });
    mailServiceMock.sendWorkshopClaimedEmail.mockRejectedValue(
      new Error('SMTP timeout'),
    );
    const loggerSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    try {
      await expect(
        listener.handle(
          new WorkshopClaimedEvent('w1', 'u1', 'dueno@example.com'),
        ),
      ).resolves.toBeUndefined();

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('workshopId=w1'),
        expect.anything(),
      );
    } finally {
      loggerSpy.mockRestore();
    }
  });
});