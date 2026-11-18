import { AddMemberDto } from '../../dto/add-member.dto';

export class AddDealershipMemberCommand {
  constructor(
    public readonly dealershipId: string,
    public readonly dto: AddMemberDto,
    public readonly performedByUserId: string,
  ) {}
}
