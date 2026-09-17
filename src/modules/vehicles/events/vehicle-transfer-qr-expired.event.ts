import { BaseEvent } from '../../../common/events/base-event';

export class VehicleTransferQrExpiredEvent extends BaseEvent {
  constructor(
    public readonly qrId: string,
    public readonly vehicleId: string,
    public readonly createdByUserId: string,
  ) {
    super('vehicle.transfer.qr_expired');
  }
}
