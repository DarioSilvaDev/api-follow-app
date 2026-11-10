import { Transform } from 'class-transformer';
import {
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';

/**
 * Body de `POST /api/vehicle-claims/public/:token/verify`.
 *
 * El backend decide el factor aplicable (F-2): con VIN registrado sólo cuenta
 * `vinLast4` y `mileageRangeId` se ignora; sin VIN se usa `mileageRangeId`.
 * Los campos del factor son opcionales a propósito: su ausencia se resuelve
 * con el mensaje único de verificación (anti-enumeración), no con un error de
 * validación distinto.
 */
export class VerifyClaimDto {
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @Matches(/^[A-Za-z0-9]{2,10}$/)
  licensePlate!: string;

  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsOptional()
  @IsString()
  @Length(4, 4)
  vinLast4?: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString()
  @MaxLength(20)
  mileageRangeId?: string;
}
