import { BaseCommand } from '../../../../common/commands/base.command';
import { UpdateMyProfileDto } from '../../dto/update-my-profile.dto';

export class UpdateMyProfileCommand extends BaseCommand {
  constructor(
    public readonly userId: string,
    public readonly dto: UpdateMyProfileDto,
  ) {
    super();
  }
}
