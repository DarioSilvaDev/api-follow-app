import { BaseCommand } from '../../../../common/commands/base.command';
import { GrantAccessDto } from '../../dto/grant-access.dto';

export class GrantAccessCommand extends BaseCommand {
  constructor(
    public readonly vehicleId: string,
    public readonly dto: GrantAccessDto,
    public readonly grantedByUserId: string,
  ) {
    super();
  }
}
