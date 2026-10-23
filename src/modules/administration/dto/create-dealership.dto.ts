import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/**
 * D-106: alta administrada de concesionaria (onboarding admin).
 * El dueño es identificado por email (debe existir o crearse luego en el
 * wizard). El CUIT se normaliza server-side (solo dígitos).
 *
 * D-TL-2: `hasOwnWorkshop` (default false) habilita el alta conjunta de la
 * concesionaria + su taller de servicio propio en la misma transacción. El
 * taller se siembra como prefill `"{name} Service"` en `pending_claim` y el
 * dedupe de nombre se difiere al claim (AC-6), NO al alta.
 */
export class CreateDealershipDto {
  @IsString()
  @MaxLength(150)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  taxId?: string;

  @IsEmail()
  ownerEmail!: string;

  @IsOptional()
  @IsBoolean()
  hasOwnWorkshop?: boolean; // default false
}
