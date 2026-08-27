import { UpdateModelDto } from '../../dto/update-model.dto';

export class UpdateModelCommand {
  constructor(
    public readonly id: string,
    public readonly dto: UpdateModelDto,
  ) {}
}
