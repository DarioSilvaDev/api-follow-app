import { Logger } from '@nestjs/common';
import { DealershipClaimedEmailListener } from './dealership-claimed-email.listener';
import { DealershipClaimedEvent } from '../events/dealership-claimed.event';

describe('DealershipClaimedEmailListener — D-106 mail de confirmación', () => {
  let listener: DealershipClaimedEmailListener;
  let prismaMock: {
    dealership: { findUnique: jest.Mock };
  };
  let mailServiceMock: {
    sendDealershipClaimedEmail: jest.Mock;
  };

  beforeEach(() => {
    prismaMock = {
      dealership: { findUnique: jest.fn() },
    };
    mailServiceMock = {
      sendDealershipClaimedEmail: jest.fn(),
    };
    listener = new DealershipClaimedEmailListener(
      prismaMock as any,
      mailServiceMock as any,
    );
  });

  it('envía la confirmación al dueño cuando la dealership quedó activa', async () => {
    prismaMock.dealership.findUnique.mockResolvedValue({
      id: 'd1',
      name: 'Concesionaria Norte',
    });

    await listener.handle(
      new DealershipClaimedEvent('d1', 'u1', 'dueno@example.com'),
    );

    expect(prismaMock.dealership.findUnique).toHaveBeenCalledWith({
      where: { id: 'd1' },
      select: { id: true, name: true },
    });
    expect(mailServiceMock.sendDealershipClaimedEmail).toHaveBeenCalledTimes(1);
    const [to, name] = mailServiceMock.sendDealershipClaimedEmail.mock.calls[0];
    expect(to).toBe('dueno@example.com');
    expect(name).toBe('Concesionaria Norte');
  });

  it('no envía mail si la dealership no existe', async () => {
    prismaMock.dealership.findUnique.mockResolvedValue(null);

    await expect(
      listener.handle(new DealershipClaimedEvent('d-missing', 'u1', 'a@b.com')),
    ).resolves.toBeUndefined();
    expect(mailServiceMock.sendDealershipClaimedEmail).not.toHaveBeenCalled();
  });

  it('no tumba el proceso si el envío de mail falla (SC-1): loguea con dealershipId', async () => {
    prismaMock.dealership.findUnique.mockResolvedValue({
      id: 'd1',
      name: 'Concesionaria Norte',
    });
    mailServiceMock.sendDealershipClaimedEmail.mockRejectedValue(
      new Error('SMTP timeout'),
    );
    const loggerSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    try {
      await expect(
        listener.handle(
          new DealershipClaimedEvent('d1', 'u1', 'dueno@example.com'),
        ),
      ).resolves.toBeUndefined();

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('dealershipId=d1'),
        expect.anything(),
      );
    } finally {
      loggerSpy.mockRestore();
    }
  });
});
