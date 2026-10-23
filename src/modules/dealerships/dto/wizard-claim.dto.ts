import {
  IsEmail,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * D-106: datos opcionales de la concesionaria que el dueño completa en el
 * wizard (paso "completar datos"). Solo campos simples del MVP.
 */
export class WizardDealershipDataDto {
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @IsOptional()
  @IsString()
  @IsUrl({ require_protocol: false })
  website?: string;

  @IsOptional()
  @IsString()
  description?: string;
}

/**
 * D-TL-4: datos del paso 2 del claim conjunto (solo si el token es de una
 * concesionaria con taller vinculado). `name` es OBLIGATORIO únicamente en
 * ese caso (AC-6); el DTO no lo exige porque el claim simple no lo envía y la
 * decisión depende de la BD (el token puede ser conjunto o simple). La
 * obligatoriedad la valida el handler con 400 'Ingresá el nombre del taller.'.
 *
 * NO se reutiliza `WizardWorkshopDataDto` de workshops (le faltan name/taxId):
 * la duplicación de 4 campos entre módulos es aceptable y evita una carpeta
 * `shared-dto` prematura (D-TL-4).
 *
 * NOTA: esta clase se declara ANTES de `WizardClaimDto` porque sus decoradores
 * (`@Type`/`@ValidateNested`) evalúan la referencia en el momento de definir la
 * clase padre; si quedara después, el module load lanza TDZ
 * ("Cannot access 'WizardWorkshopGroupDataDto' before initialization").
 */
export class WizardWorkshopGroupDataDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  taxId?: string; // normalizado server-side (solo dígitos)

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @IsOptional()
  @IsString()
  @IsUrl({ require_protocol: false })
  website?: string;

  @IsOptional()
  @IsString()
  description?: string;
}

/**
 * D-106: POST /api/dealerships/wizard/claim.
 *
 * Reglas de validación por estado de la cuenta (se validan en el handler,
 * ya que dependen de la base de datos):
 * - cuenta inexistente → firstName + lastName + password obligatorios;
 * - cuenta pending → no requiere datos de usuario (se activa);
 * - cuenta active → requiere sesión del usuario dueño del email.
 * El DTO no exige password/names para no rechazar los otros flujos en el
 * ValidationPipe global.
 */
export class WizardClaimDto {
  @IsString()
  token!: string;

  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  lastName?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(100)
  password?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => WizardDealershipDataDto)
  dealership?: WizardDealershipDataDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => WizardWorkshopGroupDataDto)
  workshop?: WizardWorkshopGroupDataDto;
}
