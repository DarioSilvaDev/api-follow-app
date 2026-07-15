import { BaseCommand } from '../../../../common/commands/base.command';

export class RefreshTokenCommand extends BaseCommand {
  constructor(public readonly refreshToken: string) {
    super();
  }
}
