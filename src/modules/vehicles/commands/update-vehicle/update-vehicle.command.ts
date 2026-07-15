import { BaseCommand } from '../../../../common/commands/base.command';
import { UpdateVehicleDto } from '../../dto/update-vehicle.dto';

export class UpdateVehicleCommand extends BaseCommand {
  constructor(
    public readonly id: string,
    public readonly dto: UpdateVehicleDto,
  ) {
    super();
  }
}
