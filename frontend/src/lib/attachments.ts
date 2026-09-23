/**
 * Iteración 2-4 — Labels y agrupación de adjuntos de evidencia (S1).
 *
 * El backend ya devuelve `attachments` agrupados (before/work/after/other);
 * este helper ordena los grupos según la UX aprobada (Antes → Trabajo →
 * Después → General) y provee labels en español.
 */
import type {
  CareEpisodeAttachment,
  CareEpisodeAttachmentGroups,
  CareEpisodeAttachmentPhase,
} from "@/types/care-episode";

/** Orden visual de los grupos de fase (S1 / diseño FE aprobado). */
export const ATTACHMENT_PHASE_ORDER: NonNullable<CareEpisodeAttachmentPhase>[] = [
  "before",
  "work",
  "after",
];

export const ATTACHMENT_GROUP_ORDER: Array<keyof CareEpisodeAttachmentGroups> = [
  "before",
  "work",
  "after",
  "other",
];

/** Label español por fase (grupo General = fase null). */
export function attachmentPhaseLabel(
  phase: CareEpisodeAttachmentPhase,
): string {
  switch (phase) {
    case "before":
      return "Antes";
    case "work":
      return "Trabajo";
    case "after":
      return "Después";
    default:
      return "General";
  }
}

/** Definición de grupo para render: la fase + sus adjuntos. */
export interface AttachmentGroupDefinition {
  key: keyof CareEpisodeAttachmentGroups;
  phase: CareEpisodeAttachmentPhase;
  label: string;
  attachments: CareEpisodeAttachment[];
}

/**
 * Convierte los grupos del backend en una lista ORDENADA para render
 * (Antes → Trabajo → Después → General), omitiendo grupos vacíos.
 */
export function orderedAttachmentGroups(
  groups: CareEpisodeAttachmentGroups,
): AttachmentGroupDefinition[] {
  return ATTACHMENT_GROUP_ORDER.flatMap(
    (key): AttachmentGroupDefinition[] => {
      const phase = key === "other" ? null : key;
      const attachments = groups[key] ?? [];
      if (attachments.length === 0) {
        return [];
      }
      return [
        {
          key,
          phase,
          label: attachmentPhaseLabel(phase),
          attachments,
        },
      ];
    },
  );
}

/** Total de adjuntos activos en los grupos (== detail.attachmentCount). */
export function countAttachments(groups: CareEpisodeAttachmentGroups): number {
  return ATTACHMENT_GROUP_ORDER.reduce(
    (total, key) => total + (groups[key]?.length ?? 0),
    0,
  );
}