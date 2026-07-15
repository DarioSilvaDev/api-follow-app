import { BaseCommand } from '../../../../common/commands/base.command';
import { UpdateAppointmentDto } from '../../dto/update-appointment.dto';

export class UpdateAppointmentCommand extends BaseCommand {
  constructor(
    public readonly id: string,
    public readonly dto: UpdateAppointmentDto,
  ) {
    super();
  }
}
