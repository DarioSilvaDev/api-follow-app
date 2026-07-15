import { BaseCommand } from '../../../../common/commands/base.command';
import { CreateAppointmentDto } from '../../dto/create-appointment.dto';

export class CreateAppointmentCommand extends BaseCommand {
  constructor(
    public readonly dto: CreateAppointmentDto,
    public readonly customerId: string,
  ) {
    super();
  }
}
