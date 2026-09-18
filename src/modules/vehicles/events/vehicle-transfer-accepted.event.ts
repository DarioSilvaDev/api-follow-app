import { BaseEvent } from '../../../common/events/base-event';

/**
 * VehicleTransferAcceptedEvent — Transferencia completada (AC7.5 QR / D-018).
 *
 * Fase 1a consignación (D-TL-9/D-TL-10): los extremos pueden ser persona o
 * concesionaria (titular intermedio), por lo que fromUserId/toUserId se
 * vuelven nullable y se agregan fromDealershipId/toDealershipId.
 */
export class VehicleTransferAcceptedEvent extends BaseEvent {
  constructor(
    public readonly transferId: string,
    public readonly vehicleId: string,
    public readonly fromUserId: string | null,
    public readonly toUserId: string,
    public readonly fromDealershipId?: string,
    public readonly toDealershipId?: string,
  ) {
    super('vehicle.transfer.accepted');
  }
}