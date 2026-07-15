import { BaseCommand } from '../../../../common/commands/base.command';

export class RequestPasswordResetCommand extends BaseCommand {
  constructor(public readonly email: string) {
    super();
  }
}
