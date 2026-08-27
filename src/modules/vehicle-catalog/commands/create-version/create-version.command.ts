import { CreateVersionDto } from '../../dto/create-version.dto';

export class CreateVersionCommand {
  constructor(public readonly dto: CreateVersionDto) {}
}
