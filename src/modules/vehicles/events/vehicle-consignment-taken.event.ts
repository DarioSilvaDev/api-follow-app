import { BaseEvent } from '../../../common/events/base-event';

/**
 * VehicleConsignmentTakenEvent — QR de TOMA consumido por un miembro de la
 * concesionaria en representación de la dealership (D-101/D-104).
 *
 * D-TL-17 / M4: evento dedicado de la cadena de consignación — SOLO IDs, sin
 * PII de empleados. NO se reemite `vehicle.transfer.accepted` con el miembro
 * como origen en este tramo.
 */
export class VehicleConsignmentTakenEvent extends BaseEvent {
  constructor(
    public readonly transferId: string,
    public readonly vehicleId: string,
    public readonly dealershipId: string,
    public readonly sellerUserId: string,
    public readonly qrId: string,
  ) {
    super('vehicle.consignment.taken');
  }
}
