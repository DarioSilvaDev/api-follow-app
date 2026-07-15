import { BaseCommand } from '../../../../common/commands/base.command';
import { TransferVehicleDto } from '../../dto/transfer-vehicle.dto';

export class TransferVehicleCommand extends BaseCommand {
  constructor(
    public readonly vehicleId: string,
    public readonly dto: TransferVehicleDto,
    public readonly fromUserId: string,
  ) {
    super();
  }
}
