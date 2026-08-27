import { UpdateWorkshopDto } from '../../dto/update-workshop.dto';

export class UpdateWorkshopCommand {
  constructor(
    public readonly workshopId: string,
    public readonly dto: UpdateWorkshopDto,
  ) {}
}
