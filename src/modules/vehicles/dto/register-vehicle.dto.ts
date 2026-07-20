import { IsString, IsOptional, IsInt, Min, Max, IsUUID } from 'class-validator';

export class RegisterVehicleDto {
  @IsString()
  licensePlate!: string;

  @IsOptional()
  @IsString()
  vin?: string;

  @IsOptional()
  @IsString()
  engineNumber?: string;

  @IsOptional()
  @IsUUID()
  versionId?: string;

  @IsOptional()
  @IsInt()
  @Min(1900)
  @Max(2100)
  manufactureYear?: number;

  @IsOptional()
  @IsInt()
  @Min(1900)
  @Max(2100)
  modelYear?: number;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
