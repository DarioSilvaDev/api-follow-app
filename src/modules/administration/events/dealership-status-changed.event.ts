import { BaseEvent } from '../../../common/events/base-event';

/**
 * P2: la concesionaria fue habilitada/deshabilitada.
 * Se emite desde el handler después del update (espejo de
 * WorkshopStatusChangedEvent, con actor para auditoría).
 */
export class DealershipStatusChangedEvent extends BaseEvent {
  constructor(
    public readonly dealershipId: string,
    public readonly isActive: boolean,
    public readonly updatedById: string,
    public readonly updatedByRole: string,
    public readonly reason?: string,
  ) {
    super('admin.dealership.status_changed');
  }
}
