import { BaseEvent } from '../../../common/events/base-event';

/**
 * VehicleConsignmentSoldEvent — QR de VENTA generado por la concesionaria
 * titular, consumido por el comprador persona (D-101/D-082).
 *
 * D-TL-17 / M4: evento dedicado de la cadena de consignación — SOLO IDs, sin
 * PII de empleados. NO se reemite `vehicle.transfer.accepted` con la
 * dealership como origen en este tramo.
 */
export class VehicleConsignmentSoldEvent extends BaseEvent {
  constructor(
    public readonly transferId: string,
    public readonly vehicleId: string,
    public readonly dealershipId: string,
    public readonly buyerUserId: string,
  ) {
    super('vehicle.consignment.sold');
  }
}
