import { BaseCommand } from '../../../../common/commands/base.command';
import { CreateDealershipDto } from '../../dto/create-dealership.dto';

export class CreateDealershipCommand extends BaseCommand {
  constructor(
    public readonly dto: CreateDealershipDto,
    public readonly ownerId: string,
  ) {
    super();
  }
}