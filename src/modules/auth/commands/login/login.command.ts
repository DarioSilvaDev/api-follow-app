import { BaseCommand } from '../../../../common/commands/base.command';
import { LoginDto } from '../../dto/login.dto';

export class LoginCommand extends BaseCommand {
  constructor(public readonly dto: LoginDto) {
    super();
  }
}
