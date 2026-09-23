import { UpdateDealershipDto } from '../../dto/update-dealership.dto';

export class UpdateDealershipCommand {
  constructor(
    public readonly dealershipId: string,
    public readonly dto: UpdateDealershipDto,
  ) {}
}
