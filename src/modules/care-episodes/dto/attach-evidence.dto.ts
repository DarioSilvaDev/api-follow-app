import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * AttachEvidenceDto — Cuerpo multipart textual de POST /:id/attachments (S4).
 *
 * La fase es REQUERIDA y restringida a before/work/after (400 si no).
 * `caption` es un campo escalar opcional: con FileInterceptor (un archivo por
 * request) no existe índice de archivo; se documenta como decisión de
 * implementación dentro del diseño aprobado.
 */
export class AttachEvidenceDto {
  @IsIn(['before', 'work', 'after'])
  phase!: 'before' | 'work' | 'after';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  caption?: string;
}