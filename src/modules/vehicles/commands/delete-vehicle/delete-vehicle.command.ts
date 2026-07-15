import { BaseCommand } from '../../../../common/commands/base.command';

export class DeleteVehicleCommand extends BaseCommand {
  constructor(public readonly id: string) {
    super();
  }
}
