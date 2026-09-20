import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * D-106: alta administrada de concesionaria (onboarding admin).
 * El dueño es identificado por email (debe existir o crearse luego en el
 * wizard). El CUIT se normaliza server-side (solo dígitos).
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
}
