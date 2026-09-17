import { GenerateTransferQrDto } from '../../dto/generate-transfer-qr.dto';

export class GenerateTransferQrCommand {
  constructor(
    public readonly vehicleId: string,
    public readonly userId: string,
    public readonly dto: GenerateTransferQrDto,
  ) {}
}
