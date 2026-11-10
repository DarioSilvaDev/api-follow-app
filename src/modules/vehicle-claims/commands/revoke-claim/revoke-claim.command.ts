export class RevokeClaimCommand {
  constructor(
    public readonly id: string,
    public readonly workshopId: string,
    public readonly userId: string,
    public readonly reason?: string | null,
  ) {}
}
