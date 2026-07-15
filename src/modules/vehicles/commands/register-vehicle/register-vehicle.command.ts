import { BaseCommand } from '../../../../common/commands/base.command';
import { RegisterVehicleDto } from '../../dto/register-vehicle.dto';

export class RegisterVehicleCommand extends BaseCommand {
  constructor(
    public readonly dto: RegisterVehicleDto,
    public readonly ownerId: string,
  ) {
    super();
  }
}
