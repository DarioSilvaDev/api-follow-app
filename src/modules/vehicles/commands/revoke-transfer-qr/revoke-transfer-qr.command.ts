export class RevokeTransferQrCommand {
  constructor(
    public readonly vehicleId: string,
    public readonly userId: string,
  ) {}
}
