import { BaseCommand } from '../../../../common/commands/base.command';

export class LogoutCommand extends BaseCommand {
  constructor(public readonly refreshToken: string) {
    super();
  }
}
