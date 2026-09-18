import { AcceptTransferQrDto } from '../../dto/accept-transfer-qr.dto';
import { CurrentContext } from '../../../../common/context/interfaces/current-context.interface';

export class AcceptTransferQrCommand {
  constructor(
    public readonly token: string,
    public readonly userId: string,
    public readonly dto: AcceptTransferQrDto,
    public readonly ctx?: CurrentContext,
  ) {}
}
