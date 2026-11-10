import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { VIN_REGEX } from '../../../common/validation/vin';

/** Máximo de tipos de atención por episodio (D-174 / §7.3.4). */
export const MAX_CHECK_IN_SERVICE_TYPES = 3;

/**
 * OwnerPhoneDto — celular opcional del propietario (D-173).
 *
 * Dos inputs separados (área + número), sin longitud fija. El país lo fija
 * `DEFAULT_PHONE_COUNTRY_CODE` en el servidor; nunca se acepta del body.
 */
export class OwnerPhoneDto {
  @IsOptional()
  @IsString()
  @MaxLength(6)
  areaCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(12)
  nationalNumber?: string;
}

/**
 * CheckInDto — POST /api/care-episodes/check-in (B-2).
 *
 * Contrato del check-in unificado: recibe la placa (no `vehicleId`) y el
 * servidor resuelve si reutiliza o crea el `Vehicle`. Los campos de catálogo
 * (`brandId`/`modelId`/`versionId`) son opcionales y excluyentes con el texto
 * libre (`brandName`/`modelName`) — la exclusividad se valida en el handler
 * porque class-validator no expresa XOR limpiamente.
 *
 * El odómetro de ingreso es obligatorio (valor **o** excepción "no legible" +
 * motivo); la regla XOR vive en el handler.
 */
export class CheckInDto {
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @Matches(/^[A-Za-z0-9]{2,10}$/, {
    message: 'La patente debe tener entre 2 y 10 caracteres alfanuméricos',
  })
  licensePlate!: string;

  // ── Datos del vehículo (sólo si se crea) ──

  @IsOptional()
  @IsString()
  @MaxLength(100)
  brandName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  modelName?: string;

  @IsOptional()
  @IsUUID()
  brandId?: string;

  @IsOptional()
  @IsUUID()
  modelId?: string;

  @IsOptional()
  @IsUUID()
  versionId?: string;

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @Matches(VIN_REGEX, {
    message: 'VIN debe tener 17 caracteres alfanuméricos (sin I, O, Q)',
  })
  vin?: string;

  // ── Atención ──

  @IsUUID()
  branchId!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  mileageIn?: number;

  @IsOptional()
  @IsBoolean()
  mileageInUnreadable?: boolean;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  mileageInUnreadableReason?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  customerComplaint?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  customerNotes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  internalNotes?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_CHECK_IN_SERVICE_TYPES)
  @IsUUID('all', { each: true })
  serviceTypeIds?: string[];

  /** Opción "Otro": texto libre (obligatorio si se elige). */
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  customServiceLabel?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => OwnerPhoneDto)
  ownerPhone?: OwnerPhoneDto | null;
}
