import { BaseEvent } from '../../../common/events/base-event';

/**
 * CareEpisodeClosedEvent — Emitido DESPUÉS del commit del cierre (B-3).
 *
 * Punto de conexión único con el módulo de reclamo (D-172): el consumidor
 * genera el invite sólo en el primer cierre efectivo del vehículo. El cierre
 * NO espera al consumidor; si falla, la atención queda `delivered` igual y el
 * fallo se reintenta desde el módulo de reclamo.
 */
export class CareEpisodeClosedEvent extends BaseEvent {
  constructor(
    public readonly careEpisodeId: string,
    public readonly vehicleId: string,
    public readonly workshopId: string,
    public readonly memberId: string,
  ) {
    super('care-episode.closed');
  }
}
