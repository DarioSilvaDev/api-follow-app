import { BaseEvent } from '../../../common/events/base-event';

/**
 * D-106: el dueño completó el wizard de onboarding y el taller pasó de
 * `pending_claim` a `active` (claimed_at seteado). Hecho significativo de
 * negocio: dispara el email de confirmación y puede alimentar notificaciones.
 */
export class WorkshopClaimedEvent extends BaseEvent {
  constructor(
    public readonly workshopId: string,
    public readonly userId: string,
    public readonly email: string,
  ) {
    super('workshop.claimed');
  }
}