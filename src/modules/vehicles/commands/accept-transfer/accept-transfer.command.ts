export class AcceptTransferCommand {
  constructor(
    public readonly transferId: string,
    public readonly userId: string,
  ) {}
}
