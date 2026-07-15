import { BaseCommand } from '../../../../common/commands/base.command';
import { UpdateUserDto } from '../../dto/update-user.dto';

export class UpdateUserCommand extends BaseCommand {
  constructor(
    public readonly id: string,
    public readonly dto: UpdateUserDto,
  ) {
    super();
  }
}
