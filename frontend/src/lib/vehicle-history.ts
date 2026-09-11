/**
 * F-014 / D-052 — Vehicle timeline merge.
 *
 * Pure merge of the three history sources returned by
 * `GET /api/vehicles/:id/history` (`{ transfers, mileages, ownerships }`)
 * into a single chronological list (newest first). Rendering-agnostic:
 * the detail page maps the `TimelineEntry[]` into the "Historial" card.
 *
 * Timestamps (D-052):
 * - transfers  → `createdAt`
 * - mileages   → `recordedAt`
 * - ownerships → `startsAt`
 */
import type { VehicleHistoryResponse } from "@/types/vehicle";

export type TimelineEntryType = "transfer" | "mileage" | "ownership";

/** Una entrada de la línea de tiempo del vehículo (D-052/RF-2). */
export interface TimelineEntry {
  /** id de la fuente (prefijada para keys únicas de React). */
  id: string;
  /** Timestamp ISO usado para ordenar (createdAt/recordedAt/startsAt). */
  date: string;
  type: TimelineEntryType;
  title: string;
  /** Texto secundario (actor / fuente / nombres), cuando aplica. */
  actor?: string;
  /** Notas de la fuente, si existen. */
  notes?: string;
}

const TRANSFER_STATUS_LABELS: Record<string, string> = {
  pending: "pendiente",
  accepted: "aceptada",
  rejected: "rechazada",
  cancelled: "cancelada",
  completed: "completada",
  expired: "expirada",
};

const MILEAGE_SOURCE_LABELS: Record<string, string> = {
  owner: "Propietario",
  workshop: "Taller",
  inspection: "Inspección",
  dealership: "Concesionaria",
  imported: "Importado",
  system: "Sistema",
};

/** Label español para `MileageSource` (misma convención que MileageSection). */
export function mileageSourceLabel(source?: string | null): string {
  if (!source) return "—";
  return MILEAGE_SOURCE_LABELS[source] ?? source;
}

function userName(user?: { firstName: string; lastName: string }): string {
  if (!user) return "";
  return [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
}

/**
 * D-052: mergea las 3 fuentes en una lista cronológica desc.
 *
 * - Transfers: date = createdAt, título "Transferencia {estado}" (D-054).
 * - Mileages:  date = recordedAt, título "{km} km registrado", actor = source.
 * - Ownerships: date = startsAt; el más antiguo es "Inicio de propiedad",
 *   los siguientes "Propiedad transferida a {user}" (D-055).
 *
 * Desempate: por timestamp; no hay regla estricta para empates exactos
 * (ver RF-1). El sort es estable — los empates conservan el orden de
 * inserción (transfers → mileages → ownerships).
 */
export function mergeHistory(history: VehicleHistoryResponse): TimelineEntry[] {
  const entries: TimelineEntry[] = [];

  for (const transfer of history.transfers) {
    entries.push({
      id: `transfer:${transfer.id}`,
      date: transfer.createdAt,
      type: "transfer",
      title: `Transferencia ${
        TRANSFER_STATUS_LABELS[transfer.status] ?? transfer.status
      }`,
      actor: `De ${userName(transfer.fromUser)} a ${userName(transfer.toUser)}`,
      notes: transfer.notes ?? undefined,
    });
  }

  for (const mileage of history.mileages) {
    entries.push({
      id: `mileage:${mileage.id}`,
      date: mileage.recordedAt,
      type: "mileage",
      title: `${mileage.mileage.toLocaleString("es-AR")} km registrado`,
      actor: mileageSourceLabel(mileage.source),
      notes: mileage.notes ?? undefined,
    });
  }

  // Ownerships: el primero cronológicamente es "Inicio de propiedad"; el
  // resto son transferencias de titularidad (D-055). El backend llega desc;
  // ordenamos asc solo para decidir el título y volvemos al merge global desc.
  const ownershipsAsc = [...history.ownerships].sort(
    (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
  );
  ownershipsAsc.forEach((ownership, index) => {
    const owner = userName(ownership.user);
    entries.push({
      id: `ownership:${ownership.id}`,
      date: ownership.startsAt,
      type: "ownership",
      title:
        index === 0
          ? "Inicio de propiedad"
          : `Propiedad transferida a ${owner}`,
      actor: owner || undefined,
      notes: ownership.notes ?? undefined,
    });
  });

  return entries.sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );
}