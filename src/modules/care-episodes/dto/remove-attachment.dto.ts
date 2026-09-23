import { IsIn, IsOptional } from 'class-validator';
import type { CareEpisodeAttachmentRemovalReason } from '@prisma/client';

/**
 * RemoveAttachmentDto — Cuerpo opcional de DELETE /:id/attachments/:attachmentId (S5).
 *
 * `removedReason` solo es OBLIGATORIO en los caminos de autorización que el
 * diseño exige (owner cleanup / workshop cleanup); la obligatoriedad se
 * evalúa en el handler por audit path. Identity NUNCA se recibe por body.
 */
export class RemoveAttachmentDto {
  @IsOptional()
  @IsIn(['duplicada', 'sin_valor', 'privacidad', 'otro'])
  removedReason?: CareEpisodeAttachmentRemovalReason;
}