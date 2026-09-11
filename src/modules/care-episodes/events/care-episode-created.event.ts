import { BaseEvent } from '../../../common/events/base-event';

export class CareEpisodeCreatedEvent extends BaseEvent {
  constructor(
    public readonly careEpisodeId: string,
    public readonly vehicleId: string,
    public readonly workshopId: string,
    public readonly createdByMemberId: string,
  ) {
    super('care-episode.created');
  }
}
