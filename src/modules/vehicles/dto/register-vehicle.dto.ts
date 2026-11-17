import {
  IsString,
  IsOptional,
  IsInt,
  Min,
  Max,
  IsUUID,
  Matches,
  Validate,
} from 'class-validator';
import { IsValidVin } from './common/vin.validator';
import { IsValidBrandModelPair } from './common/brand-model-pair.validator';

export class RegisterVehicleDto {
  // D-037: formato alfanumérico de 2 a 10 caracteres. La normalización a
  // mayúsculas + trim se aplica en RegisterVehicleHandler y en
  // findByLicensePlate (no aquí) para mantener una única fuente de verdad.
  @IsString()
  @Matches(/^[A-Za-z0-9]{2,10}$/, {
    message: 'La placa debe ser alfanumérica y tener entre 2 y 10 caracteres',
  })
  licensePlate!: string;

  // D-145/D-132: formato de VIN (17 chars, sin I/O/Q). La normalización
  // (trim + uppercase) se aplica en RegisterVehicleHandler (única fuente de
  // verdad), igual que la placa (D-037); el validador solo verifica forma.
  @IsOptional()
  @IsString()
  @Validate(IsValidVin)
  vin?: string;

  @IsOptional()
  @IsString()
  engineNumber?: string;

  // MVP sin versiones de vehículo: el catálogo se identifica por marca + modelo
  // (ambos o ninguno). El handler resuelve los nombres y los persiste en
  // `brandName`/`modelName` (D-160). `versionId` ya no se acepta en el alta.
  @IsOptional()
  @IsUUID()
  brandId?: string;

  @Validate(IsValidBrandModelPair)
  modelId?: string;

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

  // Gap 1 (D-07): kilometraje al dar de alta el vehículo.
  // - DEALERSHIP: obligatorio (falla 400 en el handler si falta).
  // - PERSONAL (D-206): opcional; el propietario conoce el odómetro actual de
  //   su vehículo y puede declararlo. Cuando viaja se persiste como la primera
  //   lectura (source=owner) en la misma transacción que el alta.
  // El DTO solo valida la forma cuando viene; la regla de contexto no puede
  // resolverse aquí.
  @IsOptional()
  @IsInt()
  @Min(0)
  initialMileage?: number;
}
