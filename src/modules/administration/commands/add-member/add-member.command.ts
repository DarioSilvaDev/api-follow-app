import { AddMemberDto } from '../../dto/add-member.dto';

export class AddMemberCommand {
  constructor(
    public readonly workshopId: string,
    public readonly dto: AddMemberDto,
    public readonly performedByUserId: string,
  ) {}
}
