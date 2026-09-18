/**
 * F-014 / D-052 + iteración 2-3 (D-069..D-071) — Vehicle timeline merge.
 *
 * Pure merge of the four history sources returned by
 * `GET /api/vehicles/:id/history` (`{ transfers, mileages, ownerships,
 * careEpisodes }`) into a single chronological list (newest first).
 * Rendering-agnostic: the detail page maps the `TimelineEntry[]` into the
 * "Historial" card.
 *
 * Timestamps (D-052 / D-070):
 * - transfers  → `createdAt`
 * - mileages   → `recordedAt`
 * - ownerships → `startsAt`
 * - cares      → `serviceDate ?? checkedInAt ?? createdAt`
 */
import type { VehicleHistoryResponse } from "@/types/vehicle";

export type TimelineEntryType = "transfer" | "mileage" | "ownership" | "care";

/** Una entrada de la línea de tiempo del vehículo (D-052/RF-2). */
export interface TimelineEntry {
  /** id de la fuente (prefijada para keys únicas de React). */
  id: string;
  /** Timestamp ISO usado para ordenar (createdAt/recordedAt/startsAt/D-070). */
  date: string;
  type: TimelineEntryType;
  title: string;
  /** Texto secundario (actor / fuente / nombres), cuando aplica. */
  actor?: string;
  /**
   * Leyenda de estado del episodio (D-071). Iteración 2-3: "Pendiente de
   * verificación" para owner sin verificar. El texto "Verificado por
   * {taller}" NUNCA vive acá: es el `actor` del episodio owner verificado y
   * su gate exclusivo es `verification === "verified"` (TL §3.3 — nunca por
   * presencia de `workshop`).
   */
  badge?: string;
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
 * D-052 + D-069..D-071: mergea las 4 fuentes en una lista cronológica desc.
 *
 * - Transfers: date = createdAt, título "Transferencia {estado}" (D-054).
 * - Mileages:  date = recordedAt, título "{km} km registrado", actor = source.
 * - Ownerships: date = startsAt; el más antiguo es "Inicio de propiedad",
 *   los siguientes "Propiedad transferida a {user}" (D-055).
 * - Cares (2-3): date = `serviceDate ?? checkedInAt ?? createdAt` (D-070);
 *   título `title ?? fallback por source` (D-071); actor según source y
 *   verification; sufijo "(cancelada)" si `status === "cancelled"`;
 *   badge "Pendiente de verificación" solo owner unverified. El actor
 *   "Verificado por {taller}" es EXCLUSIVO de `verification === "verified"`.
 *
 * Desempate: por timestamp; no hay regla estricta para empates exactos
 * (ver RF-1). El sort es estable — los empates conservan el orden de
 * inserción (transfers → mileages → ownerships → cares).
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
  // Milestone consignación (D-107): un ownership de concesionaria (type
  // company + dealership) se muestra como titular intermedio en la cadena
  // `Propietario → Concesionaria → Comprador`, sin PII de empleados.
  const ownershipsAsc = [...history.ownerships].sort(
    (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
  );
  ownershipsAsc.forEach((ownership, index) => {
    const owner =
      ownership.dealership?.name ?? userName(ownership.user);
    entries.push({
      id: `ownership:${ownership.id}`,
      date: ownership.startsAt,
      type: "ownership",
      title:
        index === 0
          ? "Inicio de propiedad"
          : owner
            ? `Propiedad transferida a ${owner}`
            : "Propiedad transferida",
      actor: owner || undefined,
      notes: ownership.notes ?? undefined,
    });
  });

  // Iteración 2-3 (D-069..D-071): episodios owner + workshop. `?? []`
  // defensivo: si el backend aún no devuelve el 4º array, el merge no rompe.
  for (const care of history.careEpisodes ?? []) {
    const workshopName = care.workshop?.name ?? care.workshopName ?? "";

    // Título: `title` presente → se usa; null → fallback por source (D-071).
    const baseTitle =
      care.title ??
      (care.source === "workshop" ? "Atención de taller" : "Servicio registrado");
    const title =
      care.status === "cancelled" ? `${baseTitle} (cancelada)` : baseTitle;

    // Actor D-071: el taller denota la fuente confiable (D-064); el owner
    // reemplaza su actor por "Verificado por {taller}" SOLO si verification
    // === "verified" — nunca por presencia del taller asignado (TL §3.3).
    let actor: string;
    let badge: string | undefined;
    if (care.source === "workshop") {
      actor = `Taller ${workshopName}`.trim();
    } else if (care.verification === "verified") {
      actor = `Verificado por ${workshopName}`.trim();
    } else {
      actor = "Registrado por el propietario";
      badge = "Pendiente de verificación";
    }

    entries.push({
      id: `care:${care.id}`,
      date: care.serviceDate ?? care.checkedInAt ?? care.createdAt,
      type: "care",
      title,
      actor,
      badge,
      notes: care.customerNotes ?? undefined,
    });
  }

  return entries.sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );
}