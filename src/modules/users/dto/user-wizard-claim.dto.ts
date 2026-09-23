import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * D-106: POST /api/users/wizard/claim.
 *
 * A diferencia del wizard de workshops/dealerships, NO se acepta email en el
 * body: el email es el de la invitación (vínculo débil por token + hash). El
 * claim siempre opera sobre la cuenta cuyo email fija la UserInvitation.
 *
 * Reglas por estado de la cuenta (se validan en el handler):
 * - cuenta inexistente → firstName + lastName + password obligatorios;
 * - cuenta pending → firstName + lastName + password obligatorios (se reactiva);
 * - cuenta active/suspended/soft-deleted → 409 (no es claim de vincular).
 * El DTO no exige names/password para no rechazar en el ValidationPipe global
 * con errores genéricos; el handler produce VALIDATION_ERROR específico.
 */
export class UserWizardClaimDto {
  @IsString()
  token!: string;

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
}