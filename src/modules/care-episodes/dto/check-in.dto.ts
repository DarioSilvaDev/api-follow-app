import { plainToInstance, Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsObject,
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
 * Máximo de fotos por check-in (D-163): la foto del tablero cuando el odómetro
 * no se puede leer. La foto `before` "recomendada" (D-170) usa el mismo campo.
 */
export const MAX_CHECK_IN_FILES = 1;

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
 * Normaliza enteros opcionales de multipart: un campo vacío (`""`) se trata
 * como "no enviado" en lugar de `0` (0 es un kilometraje válido — D-148).
 */
const toOptionalIntField = ({
  value,
  obj,
  key,
}: {
  value: unknown;
  obj: Record<string, unknown>;
  key: string;
}): unknown => {
  const raw = obj?.[key];
  if (typeof raw === 'string' && raw.trim() === '') return undefined;
  return value;
};

/**
 * Normaliza booleanos de multipart. `enableImplicitConversion` convierte
 * `Boolean('false') === true`, por lo que se lee el valor crudo del body.
 * En JSON el body ya trae un booleano y se devuelve intacto.
 */
const toBooleanField = ({
  value,
  obj,
  key,
}: {
  value: unknown;
  obj: Record<string, unknown>;
  key: string;
}): unknown => {
  const raw = obj?.[key];
  if (typeof raw !== 'string') return value;
  const normalized = raw.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1') return true;
  if (normalized === 'false' || normalized === '0' || normalized === '')
    return false;
  // Valor no reconocido: se devuelve el string crudo para que @IsBoolean
  // responda 400 (nunca un truthy silencioso).
  return raw;
};

/**
 * Normaliza arrays de multipart: campo repetido → array (multer ya lo entrega
 * así); valor único → `[valor]`; JSON serializado (`'["id"]'`) → parseado.
 */
const toArrayField = ({ value }: { value: unknown }): unknown => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (trimmed.startsWith('[')) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      return Array.isArray(parsed) ? parsed : [value];
    } catch {
      return [value];
    }
  }
  return trimmed.length > 0 ? [trimmed] : value;
};

/**
 * Normaliza `ownerPhone` de multipart. Un request multipart no puede anidar
 * objetos, así que el cliente envía `ownerPhone` como JSON serializado
 * (`{"areaCode":"336","nationalNumber":"4687486"}`). Se rehidrata como
 * `OwnerPhoneDto` para que `@ValidateNested` aplique sus decoradores.
 */
const toOwnerPhoneField = ({
  value,
  obj,
  key,
}: {
  value: unknown;
  obj: Record<string, unknown>;
  key: string;
}): unknown => {
  const raw = obj?.[key];
  if (typeof raw !== 'string') return value;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null) return null;
    if (typeof parsed === 'object') {
      return plainToInstance(OwnerPhoneDto, parsed as Record<string, unknown>);
    }
  } catch {
    // Deja el valor original: la validación del DTO responde 400.
  }
  return value;
};

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
 *
 * Ruta DUAL (D-163, patrón de POST /owner): JSON conserva el contrato
 * histórico; `multipart/form-data` agrega el campo `files` (máx. 1) con la
 * foto del tablero. En multipart los campos llegan como texto: los transforms
 * de arriba normalizan `mileageIn`, `mileageInUnreadable`, `serviceTypeIds` y
 * `ownerPhone` (JSON serializado).
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
  @Transform(toOptionalIntField)
  @IsInt()
  @Min(0)
  mileageIn?: number;

  @IsOptional()
  @Transform(toBooleanField)
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

  /**
   * Notas internas del taller (solo las ve el taller dueño del episodio).
   * Convención MVP para el teléfono de quien trae el vehículo (tercero):
   *   "Tel. alternativo: <número>" (ej. "Tel. alternativo: 11 2233 4455").
   * NUNCA guardar PII en `customerNotes` (visible a otros talleres con relación).
   */
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  internalNotes?: string;

  @IsOptional()
  @Transform(toArrayField)
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
  @Transform(toOwnerPhoneField)
  @IsObject()
  @ValidateNested()
  @Type(() => OwnerPhoneDto)
  ownerPhone?: OwnerPhoneDto | null;
}
