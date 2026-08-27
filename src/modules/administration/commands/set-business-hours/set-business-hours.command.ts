import { SetBusinessHoursDto } from '../../dto/set-business-hours.dto';

export class SetBusinessHoursCommand {
  constructor(
    public readonly branchId: string,
    public readonly dto: SetBusinessHoursDto,
  ) {}
}
