import { BaseCommand } from '../../../../common/commands/base.command';

export class CancelAppointmentCommand extends BaseCommand {
  constructor(
    public readonly id: string,
    public readonly reason?: string,
  ) {
    super();
  }
}
