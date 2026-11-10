import { Logger } from '@nestjs/common';
import { CareEpisodeClosedEvent } from '../../care-episodes/events/care-episode-closed.event';
import { CareEpisodeClosedListener } from './care-episode-closed.listener';

describe('CareEpisodeClosedListener — hook best-effort (C-5)', () => {
  let listener: CareEpisodeClosedListener;
  let handler: { executeFromClose: jest.Mock };

  const event = new CareEpisodeClosedEvent(
    'episode-1',
    'vehicle-1',
    'workshop-1',
    'member-1',
  );

  beforeEach(() => {
    handler = {
      executeFromClose: jest
        .fn()
        .mockResolvedValue({ action: 'created', inviteId: 'invite-1' }),
    };
    listener = new CareEpisodeClosedListener(handler as never);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('delega con los datos del evento (sin token ni sesión)', async () => {
    await listener.handle(event);

    expect(handler.executeFromClose).toHaveBeenCalledWith({
      vehicleId: 'vehicle-1',
      workshopId: 'workshop-1',
      careEpisodeId: 'episode-1',
    });
  });

  it('un fallo del handler no se propaga: el cierre ya está commiteado', async () => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    handler.executeFromClose.mockRejectedValue(new Error('boom'));

    await expect(listener.handle(event)).resolves.toBeUndefined();
  });

  it('deja el skipReason en el log (active_owner, AC-24)', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    handler.executeFromClose.mockResolvedValue({
      action: 'skipped',
      reason: 'active_owner',
    });

    await listener.handle(event);

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('skipReason=active_owner'),
    );
  });

  it('no loguea el camino idempotente active_invite', async () => {
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    handler.executeFromClose.mockResolvedValue({
      action: 'skipped',
      reason: 'active_invite',
    });

    await listener.handle(event);

    expect(log).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it('loguea la creación con el inviteId (sin token)', async () => {
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation();

    await listener.handle(event);

    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('inviteId=invite-1'),
    );
  });
});
