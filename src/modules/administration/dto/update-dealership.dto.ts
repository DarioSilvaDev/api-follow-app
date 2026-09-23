import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * P1 (handoff PM): edición de identidad y contacto de la concesionaria
 * (PATCH /admin/dealerships/:id).
 *
 * PATCH parcial (P7): el frontend envía únicamente los campos modificados;
 * los opcionales vaciados llegan como `null` para limpiarlos.
 *
 * Campos SOLO identidad/contacto: nombre, razón social, CUIT, email de
 * contacto, teléfono, website y descripción. `ownerEmail` queda fuera del
 * contrato — el email del dueño no se edita vía PATCH (patrón
 * `ownerEmail?: never` de UpdateWorkshopDto, acá simplemente no existe).
 *
 * La regla de CUIT bloqueado (status active + claimedAt) se valida en el
 * handler con la semántica de estado actual de la entidad.
 */
export class UpdateDealershipDto {
  @IsOptional()
  @IsString()
  @MaxLength(150)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  legalName?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  taxId?: string | null;

  @IsOptional()
  @IsEmail()
  email?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string | null;

  @IsOptional()
  @IsString()
  website?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string | null;
}
