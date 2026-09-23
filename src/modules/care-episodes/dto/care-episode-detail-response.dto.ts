import type {
  CareEpisodeAttachmentPhase,
  CareEpisodeSource,
  CareEpisodeStatus,
  CareEpisodeVerification,
} from '@prisma/client';

/**
 * CareEpisodeAttachmentItem — Adjunto de evidencia en el detalle (S1).
 *
 * `url`/`expiresAt` solo aparecen cuando ?signed=true y el adjunto está
 * activo (removedAt null). Los adjuntos removidos viajan con `removed: true`
 * (tombstone auditable) pero NUNCA se firman.
 */
export interface CareEpisodeAttachmentItem {
  id: string;
  key: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  caption: string | null;
  phase: CareEpisodeAttachmentPhase | null;
  uploadedByMemberId: string | null;
  uploadedByUserId: string | null;
  removed: boolean;
  createdAt: Date;
  url?: string;
  expiresAt?: Date;
}

/**
 * CareEpisodeDetailResponse — Cuerpo JSON de GET /api/care-episodes/:id (S1).
 *
 * Proyección por actor (defense in depth, aplicada en el mapping):
 *   - taller del episodio → customerComplaint + internalNotes visibles;
 *   - dueño vigente       → customerComplaint visible, internalNotes null;
 *   - shared/neutral      → ambos null (nunca se fuga PII).
 */
export interface CareEpisodeDetailResponse {
  id: string;
  vehicleId: string;
  vehicle: {
    id: string;
    licensePlate: string;
    brand: string | null;
    model: string | null;
    manufactureYear: number | null;
  };
  status: CareEpisodeStatus;
  source: CareEpisodeSource;
  verification: CareEpisodeVerification;
  title: string | null;
  serviceDate: Date | null;
  workshopId: string | null;
  workshopName: string | null;
  mileageIn: number | null;
  customerComplaint: string | null;
  customerNotes: string | null;
  internalNotes: string | null;
  checkedInAt: Date | null;
  closedAt: Date | null;
  createdAt: Date;
  attachments: {
    before: CareEpisodeAttachmentItem[];
    work: CareEpisodeAttachmentItem[];
    after: CareEpisodeAttachmentItem[];
    other: CareEpisodeAttachmentItem[];
  };
  attachmentCount: number;
}

export const ATTACHMENT_GROUPS: ReadonlyArray<
  'before' | 'work' | 'after' | 'other'
> = ['before', 'work', 'after', 'other'];

export function emptyAttachmentGroups(): CareEpisodeDetailResponse['attachments'] {
  return { before: [], work: [], after: [], other: [] };
}