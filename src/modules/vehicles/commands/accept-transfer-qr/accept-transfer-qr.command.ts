import { AcceptTransferQrDto } from '../../dto/accept-transfer-qr.dto';

export class AcceptTransferQrCommand {
  constructor(
    public readonly token: string,
    public readonly userId: string,
    public readonly dto: AcceptTransferQrDto,
  ) {}
}
