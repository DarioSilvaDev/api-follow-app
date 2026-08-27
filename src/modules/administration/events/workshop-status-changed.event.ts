import { BaseEvent } from '../../../common/events/base-event';

export class WorkshopStatusChangedEvent extends BaseEvent {
  constructor(
    public readonly workshopId: string,
    public readonly isActive: boolean,
  ) {
    super('admin.workshop.status_changed');
  }
}
