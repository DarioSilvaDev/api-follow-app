import { BaseCommand } from '../../../../common/commands/base.command';
import { CreateRoleDto } from '../../dto/create-role.dto';

export class CreateRoleCommand extends BaseCommand {
  constructor(
    public readonly workshopId: string,
    public readonly dto: CreateRoleDto,
  ) {
    super();
  }
}
