import { CreateWorkshopDto } from '../../dto/create-workshop.dto';

export class CreateWorkshopCommand {
  constructor(public readonly dto: CreateWorkshopDto) {}
}
