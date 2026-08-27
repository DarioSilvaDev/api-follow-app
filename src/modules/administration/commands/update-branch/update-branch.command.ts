import { UpdateBranchDto } from '../../dto/update-branch.dto';

export class UpdateBranchCommand {
  constructor(
    public readonly branchId: string,
    public readonly dto: UpdateBranchDto,
  ) {}
}
