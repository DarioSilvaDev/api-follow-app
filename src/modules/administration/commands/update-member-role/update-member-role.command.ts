export class UpdateMemberRoleCommand {
  constructor(
    public readonly memberId: string,
    public readonly roleId: string,
  ) {}
}
