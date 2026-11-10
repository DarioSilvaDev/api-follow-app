import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { MAX_CHECK_IN_SERVICE_TYPES } from './check-in.dto';

/**
 * CloseCareEpisodeDto — POST /api/care-episodes/:id/close (B-3).
 *
 * El odómetro de egreso es obligatorio (valor **o** excepción "no legible" +
 * motivo); la regla XOR y la exigencia de foto `after` en la excepción viven
 * en el handler (class-validator no las expresa limpiamente).
 *
 * `serviceTypeIds`/`customServiceLabel` son ADITIVOS sobre los tipos que el
 * episodio ya tenga (los del check-in no se reescriben — ADR-005). El handler
 * deduplica y valida que el total final quede entre 1 y 3.
 */
export class CloseCareEpisodeDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  mileageOut?: number;

  @IsOptional()
  @IsBoolean()
  mileageOutUnreadable?: boolean;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  mileageOutUnreadableReason?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_CHECK_IN_SERVICE_TYPES)
  @IsUUID('all', { each: true })
  serviceTypeIds?: string[];

  /** Opción "Otro": texto libre (obligatorio si se elige). */
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  customServiceLabel?: string;

  /** Motivo de excepción (ej. "tablero reemplazado") — D-TL-B4. */
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(1000)
  closeNotes?: string;
}
