import { BaseEvent } from '../../../common/events/base-event';

/**
 * Cambio de un campo editable de identidad/contacto de la concesionaria.
 * `from`/`to` son `string | null` (todos los campos editables son
 * nullable en persistencia; `name` siempre es string).
 */
export interface DealershipFieldChange {
  from: string | null;
  to: string | null;
}

/**
 * P1: la edición admin de la concesionaria se aplicó con éxito.
 * Se emite desde el handler después del update (patrón eventos admin).
 */
export class DealershipUpdatedEvent extends BaseEvent {
  constructor(
    public readonly dealershipId: string,
    public readonly updatedById: string,
    public readonly updatedByRole: string,
    public readonly changes: Record<string, DealershipFieldChange>,
  ) {
    super('admin.dealership.updated');
  }
}
