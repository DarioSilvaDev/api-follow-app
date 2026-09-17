import { IsIn, IsNotEmpty } from 'class-validator';
import { QR_SOURCE_PRESENCIAL, QR_SOURCE_CONCESIONARIA } from '../constants/transfer-qr.constants';

export class GenerateTransferQrDto {
  @IsNotEmpty()
  @IsIn([QR_SOURCE_PRESENCIAL, QR_SOURCE_CONCESIONARIA])
  source!: string;
}
