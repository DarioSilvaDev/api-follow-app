import {
  IsString,
  IsOptional,
  IsInt,
  Min,
  Max,
  IsEnum,
  IsUUID,
} from 'class-validator';
import { FuelType, TransmissionType, BodyType } from '@prisma/client';

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
