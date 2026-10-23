import { BaseCommand } from '../../../../common/commands/base.command';
import { CurrentContext } from '../../../../common/context/interfaces/current-context.interface';
import { CorrectVinDto } from '../../dto/correct-vin.dto';

export class CorrectVinCommand extends BaseCommand {
  constructor(
    public readonly vehicleId: string,
    public readonly dto: CorrectVinDto,
    public readonly actorUserId: string,
    public readonly context?: CurrentContext,
  ) {
    super();
  }
}
