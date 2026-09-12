import { BaseEvent } from '../../../common/events/base-event';

/**
 * CareEpisodeVerifiedEvent — Emitido cuando un taller confirma un episodio
 * registrado por el propietario (source='owner', verification='unverified').
 *
 * La verificación es una afirmación auditable del taller que NUNCA cambia el
 * origen del episodio (D-063).
 */
export class CareEpisodeVerifiedEvent extends BaseEvent {
  constructor(
    public readonly careEpisodeId: string,
    public readonly vehicleId: string,
    public readonly workshopId: string,
    public readonly verifiedByMemberId: string,
    public readonly verifiedAt: Date,
  ) {
    super('care-episode.verified');
  }
}
