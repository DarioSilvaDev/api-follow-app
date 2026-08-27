import { BaseCommand } from '../../../../common/commands/base.command';
import { UpdateRoleDto } from '../../dto/update-role.dto';

export class UpdateRoleCommand extends BaseCommand {
  constructor(
    public readonly workshopId: string,
    public readonly roleId: string,
    public readonly dto: UpdateRoleDto,
  ) {
    super();
  }
}
