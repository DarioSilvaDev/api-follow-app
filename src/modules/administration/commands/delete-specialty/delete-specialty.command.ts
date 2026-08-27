import { BaseCommand } from '../../../../common/commands/base.command';

export class DeleteSpecialtyCommand extends BaseCommand {
  constructor(public readonly id: string) {
    super();
  }
}
