import { IsBoolean, Equals } from 'class-validator';

export class AcceptTransferQrDto {
  @IsBoolean()
  @Equals(true)
  confirmation!: boolean;
}
