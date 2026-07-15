import { BaseCommand } from '../../../../common/commands/base.command';

export class DeleteUserCommand extends BaseCommand {
  constructor(public readonly id: string) {
    super();
  }
}
