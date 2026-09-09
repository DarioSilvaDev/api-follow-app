import {
  IsString,
  IsOptional,
  IsInt,
  Min,
  Max,
  IsUUID,
  Matches,
} from 'class-validator';

export class RegisterVehicleDto {
  // D-037: formato alfanumérico de 2 a 10 caracteres. La normalización a
  // mayúsculas + trim se aplica en RegisterVehicleHandler y en
  // findByLicensePlate (no aquí) para mantener una única fuente de verdad.
  @IsString()
  @Matches(/^[A-Za-z0-9]{2,10}$/, {
    message: 'La placa debe ser alfanumérica y tener entre 2 y 10 caracteres',
  })
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
