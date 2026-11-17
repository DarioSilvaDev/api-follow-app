import { IsOptional, IsString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

/**
 * RejectCareEpisodeDto — POST /api/care-episodes/:id/reject (RF-9).
 *
 * `reason` es opcional y best-effort: el rechazo es válido sin motivo
 * (D-202/D-205). El trim sigue el patrón de `CloseCareEpisodeDto`; el
 * MaxLength(500) coincide con `CareEpisode.rejection_reason` (VarChar(500)).
 * Un string vacío tras el trim se normaliza a `undefined` → se persiste NULL.
 */
export class RejectCareEpisodeDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed.length === 0 ? undefined : trimmed;
  })
  @IsString()
  @MaxLength(500)
  reason?: string;
}
