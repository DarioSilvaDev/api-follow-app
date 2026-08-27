import { IsEmail, IsString, IsOptional } from 'class-validator';

export class TransferVehicleDto {
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
