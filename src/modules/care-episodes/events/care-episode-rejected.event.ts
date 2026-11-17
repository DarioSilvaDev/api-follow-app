import { BaseEvent } from '../../../common/events/base-event';

/**
 * CareEpisodeRejectedEvent — Emitido cuando el taller responsable RECHAZA un
 * episodio registrado por el propietario (source='owner',
 * verification='unverified' → 'rejected').
 *
 * Rechazo terminal (D-205): el registro no se borra ni se oculta; sale de la
 * cola del taller automáticamente (filtro `unverified`) y queda congelada su
 * evidencia (mismo gate FROZEN que `verified`). El rechazo NUNCA cambia el
 * origen del episodio (D-063).
 *
 * `rejectionReason` es opcional (el motivo del taller es best-effort para el
 * propietario — D-204).
 */
export class CareEpisodeRejectedEvent extends BaseEvent {
  constructor(
    public readonly careEpisodeId: string,
    public readonly vehicleId: string,
    public readonly workshopId: string,
    public readonly rejectedByMemberId: string,
    public readonly rejectedAt: Date,
    public readonly rejectionReason?: string | null,
  ) {
    super('care-episode.rejected');
  }
}
