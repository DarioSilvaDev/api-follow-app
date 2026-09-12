import { BaseEvent } from '../../../common/events/base-event';

/**
 * CareEpisodeCreatedEvent — Emitido tras la creación de un care episode.
 *
 * Iteración 2-2 (SPEC F-020 §7): el payload se extiende con `source` y los
 * campos nullable del taller:
 *   - taller (F-020):     source='workshop', workshopId + createdByMemberId
 *   - propietario (2-2):  source='owner', createdByUserId set, workshopId null
 *                         (o id del taller de app vía lista de verificaciones)
 */
export class CareEpisodeCreatedEvent extends BaseEvent {
  constructor(
    public readonly careEpisodeId: string,
    public readonly vehicleId: string,
    public readonly source: 'workshop' | 'owner',
    public readonly workshopId: string | null,
    public readonly createdByMemberId: string | null,
    public readonly createdByUserId?: string | null,
  ) {
    super('care-episode.created');
  }
}
