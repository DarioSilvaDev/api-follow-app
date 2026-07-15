import { BaseCommand } from '../../../../common/commands/base.command';
import { CreateBranchDto } from '../../dto/create-branch.dto';

export class CreateBranchCommand extends BaseCommand {
  constructor(
    public readonly workshopId: string,
    public readonly dto: CreateBranchDto,
  ) {
    super();
  }
}
