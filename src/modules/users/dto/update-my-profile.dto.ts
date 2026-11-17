import { Type } from 'class-transformer';
import {
  IsOptional,
  IsString,
  MinLength,
  MaxLength,
  ValidateNested,
} from 'class-validator';

/**
 * Celular de la cuenta (D-173): dos inputs separados (área + número), sin
 * longitud fija. El país lo fija `DEFAULT_PHONE_COUNTRY_CODE` en el servidor;
 * nunca se acepta del body. Objeto con ambos campos vacíos (o `null`) limpia
 * el celular.
 */
export class UpdateMyProfilePhoneDto {
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
 * Self-service (PATCH /users/me): el usuario autenticado edita SOLO sus
 * datos personales básicos. Email, alias, roles, contraseña y avatar NO
 * pasan por acá (cada uno tiene su propio flujo y su propio contrato).
 */
export class UpdateMyProfileDto {
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

  /**
   * `undefined` = no tocar · `null` u objeto con ambos campos vacíos = limpiar
   * · objeto con área+número = setear (E.164 canónico en `phone`).
   */
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateMyProfilePhoneDto)
  phone?: UpdateMyProfilePhoneDto | null;
}
