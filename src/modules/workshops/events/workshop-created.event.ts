import { BaseEvent } from '../../../common/events/base-event';

export class WorkshopCreatedEvent extends BaseEvent {
  constructor(
    public readonly workshopId: string,
    public readonly ownerId: string,
  ) {
    super('workshop.created');
  }
}
