import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * POST /api/vehicle-claims/:id/revoke — motivo libre opcional del panel.
 *
 * El motivo persistido sigue siendo el enum `by_workshop`; este campo es copy
 * de UI/auditoría y no se guarda en el invite (no hay columna para texto
 * libre).
 */
export class RevokeClaimDto {
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(500)
  reason?: string;
}
