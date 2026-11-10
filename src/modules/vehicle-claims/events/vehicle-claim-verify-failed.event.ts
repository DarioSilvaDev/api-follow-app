import { BaseEvent } from '../../../common/events/base-event';

/**
 * `vehicle-claim.verify-failed` — cada fallo de verificación (T3/T4/T19).
 * C-4 lo usa para avisar al taller (indicio de fuga o reenvío indebido).
 */
export class VehicleClaimVerifyFailedEvent extends BaseEvent {
  constructor(
    public readonly inviteId: string,
    public readonly vehicleId: string,
    public readonly workshopId: string,
    public readonly failedAttempts: number,
    public readonly locked: boolean,
    public readonly autoRevoked: boolean,
  ) {
    super('vehicle-claim.verify-failed');
  }
}
