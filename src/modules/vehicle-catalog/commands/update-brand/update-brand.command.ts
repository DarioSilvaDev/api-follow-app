import { UpdateBrandDto } from '../../dto/update-brand.dto';

export class UpdateBrandCommand {
  constructor(
    public readonly id: string,
    public readonly dto: UpdateBrandDto,
  ) {}
}
