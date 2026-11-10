import { Transform } from 'class-transformer';
import {
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

/**
 * POST /api/vehicle-claims — alta manual de un invite desde el panel.
 *
 * `ownerPhone` es un snapshot opcional en E.164; si falta, el handler lee el
 * `VehicleOwnerContact` activo `available`. No corrige el contacto guardado
 * (D-TL-VC-9).
 */
export class CreateClaimInviteDto {
  @IsUUID()
  vehicleId!: string;

  @IsOptional()
  @IsUUID()
  careEpisodeId?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Matches(/^\+[1-9]\d{6,14}$/, {
    message: 'ownerPhone debe estar en formato E.164 (ej. +5491123456789)',
  })
  @MaxLength(30)
  ownerPhone?: string;
}
