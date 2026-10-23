import { BaseCommand } from '../../../../common/commands/base.command';
import { CurrentContext } from '../../../../common/context/interfaces/current-context.interface';
import { RegisterVehicleDto } from '../../dto/register-vehicle.dto';

/**
 * Alta de vehículo (F-010). `userId` es la persona física que actúa; `ctx` es el
 * contexto activo, que decide la rama: PERSONAL (owner) o DEALERSHIP (stock
 * propio, Gap 1 / D-128).
 */
export class RegisterVehicleCommand extends BaseCommand {
  constructor(
    public readonly dto: RegisterVehicleDto,
    public readonly userId: string,
    public readonly ctx: CurrentContext,
  ) {
    super();
  }
}
