import { BaseCommand } from '../../../../common/commands/base.command';

export class ResetPasswordCommand extends BaseCommand {
  constructor(
    public readonly token: string,
    public readonly password: string,
  ) {
    super();
  }
}
