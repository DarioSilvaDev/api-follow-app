import { Logger } from '@nestjs/common';
import { CareEpisodeRejectedEvent } from '../events/care-episode-rejected.event';
import { CareEpisodeRejectedEmailListener } from './care-episode-rejected-email.listener';

/**
 * CareEpisodeRejectedEmailListener — D-203/D-204 (RF-9).
 *
 * Cubre: destino = propietario ACTUAL (ownership vigente), motivo presente y
 * ausente, skip sin propietario/episodio, y best-effort (nunca rompe el
 * handler de rechazo).
 */
describe('CareEpisodeRejectedEmailListener (D-204: email al propietario)', () => {
  let listener: CareEpisodeRejectedEmailListener;
  let prisma: {
    careEpisode: { findUnique: jest.Mock };
    vehicleOwnership: { findFirst: jest.Mock };
  };
  let mailService: { sendCareEpisodeRejectedEmail: jest.Mock };

  const episodeRow = {
    id: 'ce-1',
    title: 'Cambio de aceite + 2 neumáticos',
    serviceDate: new Date('2026-06-15T00:00:00.000Z'),
    rejectionReason: 'El kilometraje no coincide con el último service',
    vehicle: { licensePlate: 'ABC123' },
    workshop: { name: 'Lubricentro Central' },
  };

  const ownerRow = {
    user: { id: 'owner-1', firstName: 'Pedro', email: 'pedro@test.com' },
  };

  const event = new CareEpisodeRejectedEvent(
    'ce-1',
    'v-1',
    'w-1',
    'm-1',
    new Date('2026-11-13T12:00:00.000Z'),
    'El kilometraje no coincide con el último service',
  );

  beforeEach(() => {
    prisma = {
      careEpisode: {
        findUnique: jest.fn().mockResolvedValue(episodeRow),
      },
      vehicleOwnership: {
        findFirst: jest.fn().mockResolvedValue(ownerRow),
      },
    };
    mailService = {
      sendCareEpisodeRejectedEmail: jest.fn().mockResolvedValue({ ok: true }),
    };
    listener = new CareEpisodeRejectedEmailListener(
      prisma as never,
      mailService as never,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('manda el email al propietario ACTUAL del vehículo con el motivo', async () => {
    await listener.handle(event);

    // Destino: ownership vigente del vehículo, no un id del evento (el actor
    // del evento es el miembro del taller).
    expect(prisma.vehicleOwnership.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ vehicleId: 'v-1', endsAt: null }),
      }),
    );
    expect(mailService.sendCareEpisodeRejectedEmail).toHaveBeenCalledWith(
      'pedro@test.com',
      'Pedro',
      expect.objectContaining({
        vehicleId: 'v-1',
        careEpisodeId: 'ce-1',
        title: 'Cambio de aceite + 2 neumáticos',
        serviceDate: '2026-06-15',
        licensePlate: 'ABC123',
        workshopName: 'Lubricentro Central',
        rejectionReason: 'El kilometraje no coincide con el último service',
      }),
      expect.objectContaining({
        vehicleId: 'v-1',
        workshopId: 'w-1',
        userId: 'owner-1',
      }),
    );
  });

  it('sin motivo: sigue mandando el email con rejectionReason null', async () => {
    const withoutReason = new CareEpisodeRejectedEvent(
      'ce-1',
      'v-1',
      'w-1',
      'm-1',
      new Date('2026-11-13T12:00:00.000Z'),
      null,
    );
    prisma.careEpisode.findUnique.mockResolvedValue({
      ...episodeRow,
      rejectionReason: null,
    });

    await listener.handle(withoutReason);

    expect(mailService.sendCareEpisodeRejectedEmail).toHaveBeenCalledWith(
      'pedro@test.com',
      'Pedro',
      expect.objectContaining({ rejectionReason: null }),
      expect.any(Object),
    );
  });

  it('sin propietario vigente: warn y NO manda el email', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    prisma.vehicleOwnership.findFirst.mockResolvedValue(null);

    await listener.handle(event);

    expect(mailService.sendCareEpisodeRejectedEmail).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('no active owner user'),
    );
  });

  it('episodio inexistente (borrado entre commit y envío): warn y NO manda', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    prisma.careEpisode.findUnique.mockResolvedValue(null);

    await listener.handle(event);

    expect(mailService.sendCareEpisodeRejectedEmail).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('episode missing'),
    );
  });

  it('best-effort: un fallo inesperado se loguea y NO propaga (el rechazo ya está committeado)', async () => {
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    prisma.vehicleOwnership.findFirst.mockRejectedValue(new Error('db down'));

    await expect(listener.handle(event)).resolves.toBeUndefined();

    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('Rejected email failed unexpectedly'),
      expect.any(String),
    );
    expect(mailService.sendCareEpisodeRejectedEmail).not.toHaveBeenCalled();
  });

  it('nunca loguea el motivo ni datos del propietario (solo ids de correlación)', async () => {
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    prisma.vehicleOwnership.findFirst.mockRejectedValue(new Error('db down'));

    await listener.handle(event);

    const logged = [
      ...(error.mock.calls as unknown[][]),
      ...(warn.mock.calls as unknown[]),
    ].join(' ');
    expect(logged).not.toContain('pedro@test.com');
    expect(logged).not.toContain('kilometraje');
  });
});
