export type ReviewClaimAction = 'approve' | 'reject';

export class ReviewClaimCommand {
  constructor(
    public readonly id: string,
    public readonly workshopId: string,
    public readonly memberId: string,
    public readonly userId: string,
    public readonly action: ReviewClaimAction,
  ) {}
}
