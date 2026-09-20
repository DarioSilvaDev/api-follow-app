import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * D-106: alta administrada de taller (onboarding admin).
 * Espejo de CreateDealershipDto: el dueño es identificado por email (debe
 * existir o crearse luego en el wizard público). El taxId se normaliza
 * server-side (solo dígitos).
 *
 * NO reutiliza CreateWorkshopDto (que arrastra legalName/email/phone/website/
 * description y es base de UpdateWorkshopDto vía PartialType): el contrato de
 * POST /admin/workshops pasa a {name, taxId?, ownerEmail} y el PATCH existente
 * conserva su DTO actual sin cambios.
 */
export class CreateWorkshopOnboardingDto {
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