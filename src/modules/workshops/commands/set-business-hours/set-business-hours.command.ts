import { BaseCommand } from '../../../../common/commands/base.command';
import { SetBusinessHoursDto } from '../../dto/set-business-hours.dto';

export class SetBusinessHoursCommand extends BaseCommand {
  constructor(
    public readonly branchId: string,
    public readonly dto: SetBusinessHoursDto,
  ) {
    super();
  }
}
