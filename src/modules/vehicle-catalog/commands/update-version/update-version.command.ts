import { UpdateVersionDto } from '../../dto/update-version.dto';

export class UpdateVersionCommand {
  constructor(
    public readonly id: string,
    public readonly dto: UpdateVersionDto,
  ) {}
}
