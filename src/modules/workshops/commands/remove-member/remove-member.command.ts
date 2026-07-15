import { BaseCommand } from '../../../../common/commands/base.command';

export class RemoveMemberCommand extends BaseCommand {
  constructor(public readonly memberId: string) {
    super();
  }
}
