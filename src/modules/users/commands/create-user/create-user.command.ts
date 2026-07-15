import { BaseCommand } from '../../../../common/commands/base.command';
import { CreateUserDto } from '../../dto/create-user.dto';

export class CreateUserCommand extends BaseCommand {
  constructor(public readonly dto: CreateUserDto) {
    super();
  }
}
