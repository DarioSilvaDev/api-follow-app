import { BaseCommand } from '../../../../common/commands/base.command';
import { UpdateDealershipDto } from '../../dto/update-dealership.dto';

export class UpdateDealershipCommand extends BaseCommand {
  constructor(
    public readonly id: string,
    public readonly dto: UpdateDealershipDto,
  ) {
    super();
  }
}