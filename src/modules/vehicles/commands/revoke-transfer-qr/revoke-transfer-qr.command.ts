import { CurrentContext } from '../../../../common/context/interfaces/current-context.interface';

export class RevokeTransferQrCommand {
  constructor(
    public readonly vehicleId: string,
    public readonly userId: string,
    public readonly ctx?: CurrentContext,
  ) {}
}
