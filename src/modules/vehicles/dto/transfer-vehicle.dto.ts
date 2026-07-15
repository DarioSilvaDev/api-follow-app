import { IsString, IsUUID, IsOptional } from 'class-validator';

export class TransferVehicleDto {
  @IsUUID()
  toUserId!: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
