import { CreateBranchDto } from '../../dto/create-branch.dto';

export class CreateBranchCommand {
  constructor(
    public readonly workshopId: string,
    public readonly dto: CreateBranchDto,
  ) {}
}
