import { BaseEvent } from '../../../common/events/base-event';
import type { CareEpisodeAttachmentPhase } from '@prisma/client';

/**
 * CareEpisodeAttachmentAddedEvent — Emitido tras la creación exitosa de un
 * adjunto (evidencia) sobre un CareEpisode de taller (S4).
 *
 * Se emite UN evento por adjunto, DESPUÉS del commit de la transacción.
 * El payload replica los campos del registro creado (jamás identity desde body).
 */
export interface CareEpisodeAttachmentAddedPayload {
  attachmentId: string;
  careEpisodeId: string;
  vehicleId: string;
  key: string;
  mimeType: string;
  sizeBytes: number;
  phase: CareEpisodeAttachmentPhase;
  uploadedByMemberId: string | null;
  uploadedByUserId: string | null;
  createdAt: Date;
}

export class CareEpisodeAttachmentAddedEvent extends BaseEvent {
  constructor(public readonly payload: CareEpisodeAttachmentAddedPayload) {
    super('care-episode.attachment.added');
  }
}