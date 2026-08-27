export class RejectTransferCommand {
  constructor(
    public readonly transferId: string,
    public readonly userId: string,
  ) {}
}
