import { BaseCommand } from '../../../../common/commands/base.command';
import { RegisterDto } from '../../dto/register.dto';

export class RegisterCommand extends BaseCommand {
  constructor(public readonly dto: RegisterDto) {
    super();
  }
}
