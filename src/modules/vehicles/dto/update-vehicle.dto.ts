import {
  IsEmpty,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min,
  Validate,
} from 'class-validator';
import { IsValidBrandModelPair } from './common/brand-model-pair.validator';

/**
 * PATCH parcial de vehículo (D-040). Cada campo editable DEBE llevar su
 * decorador: el ValidationPipe global corre con `whitelist: true`
 * (src/main.ts), por lo que cualquier propiedad sin decorador es eliminada
 * silenciosamente y el PATCH queda no-op. Los validadores espejan
 * RegisterVehicleDto (D-037) para mantener un contrato de entrada coherente.
 *
 * `vin` se declara con `@IsEmpty()` (sin `@IsOptional()`) para que un cliente
 * que intente enviarlo reciba un 400 explícito en lugar de que el whitelist lo
 * descarte: la corrección de VIN es un flujo auditado aparte (D-143/D-144).
 */
export class UpdateVehicleDto {
  @IsEmpty({ message: 'VIN cannot be updated via PATCH /vehicles/:id' })
  vin?: string;

  // D-037: mismo contrato de placa que RegisterVehicleDto (alfanumérico 2-10).
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9]{2,10}$/, {
    message: 'La placa debe ser alfanumérica y tener entre 2 y 10 caracteres',
  })
  licensePlate?: string;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsString()
  notes?: string;

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
  engineNumber?: string;

  // MVP sin versiones de vehículo: el catálogo se identifica por marca + modelo
  // (ambos o ninguno). Si vienen, el handler resuelve los nombres y los
  // persiste en `brandName`/`modelName`, limpiando `versionId` (D-160). `versionId`
  // ya no se acepta en el PATCH.
  @IsOptional()
  @IsUUID()
  brandId?: string;

  @Validate(IsValidBrandModelPair)
  modelId?: string;
}
