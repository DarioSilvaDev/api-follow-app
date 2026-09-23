import { BaseEvent } from '../../../common/events/base-event';
import type { CareEpisodeAttachmentRemovalReason } from '@prisma/client';

/**
 * CareEpisodeAttachmentRemovedEvent — Emitido tras el borrado lógico (void)
 * de un adjunto de evidencia (S5).
 *
 * Se emite DESPUÉS del commit de la transacción y del intento de borrado del
 * blob (best-effort). `audit` describe el rol con el que se autorizó la
 * remoción: uploader | current_owner | workshop_cleanup | super_admin.
 */
export type CareEpisodeAttachmentRemovedAudit =
  | 'uploader'
  | 'current_owner'
  | 'workshop_cleanup'
  | 'super_admin';

export interface CareEpisodeAttachmentRemovedPayload {
  attachmentId: string;
  careEpisodeId: string;
  vehicleId: string;
  key: string;
  removedByMemberId: string | null;
  removedByUserId: string | null;
  removedReason: CareEpisodeAttachmentRemovalReason | null;
  removedAt: Date;
  audit: CareEpisodeAttachmentRemovedAudit;
}

export class CareEpisodeAttachmentRemovedEvent extends BaseEvent {
  constructor(public readonly payload: CareEpisodeAttachmentRemovedPayload) {
    super('care-episode.attachment.removed');
  }
}