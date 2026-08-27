import { CreateBrandDto } from '../../dto/create-brand.dto';

export class CreateBrandCommand {
  constructor(public readonly dto: CreateBrandDto) {}
}
