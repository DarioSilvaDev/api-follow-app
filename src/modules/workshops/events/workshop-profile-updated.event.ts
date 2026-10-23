import { BaseEvent } from '../../../common/events/base-event';

export interface WorkshopProfileChangeField {
  from: string | null;
  to: string | null;
}

export class WorkshopProfileUpdatedEvent extends BaseEvent {
  constructor(
    public readonly workshopId: string,
    public readonly changes: Record<string, WorkshopProfileChangeField>,
    public readonly changedByUserId: string | null,
    public readonly reason?: string,
  ) {
    super('workshop.profile.updated');
  }
}
