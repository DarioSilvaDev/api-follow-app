import { BaseEvent } from '../../../common/events/base-event';

/**
 * VehicleConsignmentReturnedEvent — QR inverso de DEVOLUCIÓN (D-105) consumido
 * por el vendedor original, que recupera la titularidad.
 *
 * D-TL-17 / M4: evento dedicado de la cadena de consignación — SOLO IDs, sin
 * PII de empleados. NO se reemite `vehicle.transfer.accepted` con la
 * dealership como origen en este tramo.
 */
export class VehicleConsignmentReturnedEvent extends BaseEvent {
  constructor(
    public readonly transferId: string,
    public readonly vehicleId: string,
    public readonly dealershipId: string,
    public readonly sellerUserId: string,
  ) {
    super('vehicle.consignment.returned');
  }
}
