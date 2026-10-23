import { Logger } from '@nestjs/common';
import { DealershipClaimedEmailListener } from './dealership-claimed-email.listener';
import { DealershipClaimedEvent } from '../events/dealership-claimed.event';

describe('DealershipClaimedEmailListener — D-106 mail de confirmación', () => {
  let listener: DealershipClaimedEmailListener;
  let prismaMock: {
    dealership: { findUnique: jest.Mock };
    workshop: { findFirst: jest.Mock };
  };
  let mailServiceMock: {
    sendDealershipClaimedEmail: jest.Mock;
    sendDealershipGroupClaimedEmail: jest.Mock;
  };

  beforeEach(() => {
    prismaMock = {
      dealership: { findUnique: jest.fn() },
      workshop: { findFirst: jest.fn() },
    };
    mailServiceMock = {
      sendDealershipClaimedEmail: jest.fn(),
      sendDealershipGroupClaimedEmail: jest.fn(),
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
    // Sin taller vinculado → template actual (claim simple).
    prismaMock.workshop.findFirst.mockResolvedValue(null);

    await listener.handle(
      new DealershipClaimedEvent('d1', 'u1', 'dueno@example.com'),
    );

    expect(prismaMock.dealership.findUnique).toHaveBeenCalledWith({
      where: { id: 'd1' },
      select: { id: true, name: true },
    });
    expect(prismaMock.workshop.findFirst).toHaveBeenCalledWith({
      where: { dealershipId: 'd1' },
      select: { id: true, name: true },
    });
    expect(mailServiceMock.sendDealershipClaimedEmail).toHaveBeenCalledTimes(1);
    expect(
      mailServiceMock.sendDealershipGroupClaimedEmail,
    ).not.toHaveBeenCalled();
    const [to, name] = mailServiceMock.sendDealershipClaimedEmail.mock.calls[0];
    expect(to).toBe('dueno@example.com');
    expect(name).toBe('Concesionaria Norte');
  });

  it('D-TL-5: con taller vinculado envía la variante COMBINADA (2 CTAs) y no la simple', async () => {
    prismaMock.dealership.findUnique.mockResolvedValue({
      id: 'd1',
      name: 'Concesionaria Norte',
    });
    prismaMock.workshop.findFirst.mockResolvedValue({
      id: 'w1',
      name: 'Concesionaria Norte Service',
    });

    await listener.handle(
      new DealershipClaimedEvent('d1', 'u1', 'dueno@example.com'),
    );

    expect(
      mailServiceMock.sendDealershipGroupClaimedEmail,
    ).toHaveBeenCalledTimes(1);
    expect(mailServiceMock.sendDealershipClaimedEmail).not.toHaveBeenCalled();
    const [to, dealershipName, workshopName, context] =
      mailServiceMock.sendDealershipGroupClaimedEmail.mock.calls[0];
    expect(to).toBe('dueno@example.com');
    expect(dealershipName).toBe('Concesionaria Norte');
    expect(workshopName).toBe('Concesionaria Norte Service');
    expect(context).toEqual({ dealershipId: 'd1', workshopId: 'w1' });
  });

  it('no envía mail si la dealership no existe', async () => {
    prismaMock.dealership.findUnique.mockResolvedValue(null);

    await expect(
      listener.handle(new DealershipClaimedEvent('d-missing', 'u1', 'a@b.com')),
    ).resolves.toBeUndefined();
    expect(mailServiceMock.sendDealershipClaimedEmail).not.toHaveBeenCalled();
    expect(prismaMock.workshop.findFirst).not.toHaveBeenCalled();
  });

  it('no tumba el proceso si el envío de mail falla (SC-1): loguea con dealershipId', async () => {
    prismaMock.dealership.findUnique.mockResolvedValue({
      id: 'd1',
      name: 'Concesionaria Norte',
    });
    prismaMock.workshop.findFirst.mockResolvedValue(null);
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
