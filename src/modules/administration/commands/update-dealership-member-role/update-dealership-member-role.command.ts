export class UpdateDealershipMemberRoleCommand {
  constructor(
    public readonly memberId: string,
    public readonly roleId: string,
  ) {}
}
