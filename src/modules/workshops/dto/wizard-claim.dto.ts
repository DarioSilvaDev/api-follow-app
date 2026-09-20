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
 * D-106: datos opcionales del taller que el dueño completa en el wizard
 * (paso "completar datos"). Solo campos simples del MVP.
 */
export class WizardWorkshopDataDto {
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
 * D-106: POST /api/workshops/wizard/claim.
 *
 * Reglas de validación por estado de la cuenta (se validan en el handler,
 * ya que dependen de la base de datos):
 * - cuenta inexistente → firstName + lastName + password obligatorios;
 * - cuenta pending → requiere el mismo set (se reactiva);
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
  @Type(() => WizardWorkshopDataDto)
  workshop?: WizardWorkshopDataDto;
}