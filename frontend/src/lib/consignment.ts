/**
 * Milestone consignación (D-101..D-108) — helpers puros del flujo de
 * concesionaria: propósito del QR, titular organizacional activo y labels.
 *
 * Render-agnostic (sin React): las páginas y componentes llaman a estas
 * funciones para ramificar la UI por `purpose` (resolución PM §3.3) y para
 * detectar el banner de consignación (D-107 / RB-09).
 */
import type {
  TransferQrPreview,
  TransferQrPurpose,
  Vehicle,
  VehicleOwnership,
} from "@/types/vehicle";

/**
 * Propósito efectivo de un QR: el campo es opcional en el contrato
 * (resolución PM §3.1 — purpose NULL en BD = flujo clásico persona→persona).
 * Default → "transfer".
 */
export function resolveQrPurpose(
  preview: Pick<TransferQrPreview, "purpose"> | undefined | null,
): TransferQrPurpose {
  return preview?.purpose ?? "transfer";
}

const QR_PURPOSE_LABELS: Record<TransferQrPurpose, string> = {
  take: "Toma",
  sale: "Venta",
  return: "Devolución",
  transfer: "Transferencia",
};

/** Etiqueta corta español para el propósito del QR. */
export function qrPurposeLabel(purpose: TransferQrPurpose): string {
  return QR_PURPOSE_LABELS[purpose];
}

/**
 * Concesionaria titular intermedia activa de un vehículo (D-101/D-107).
 * `active` = ownership vigente (endsAt null) de tipo `company` con dealership.
 * null → el vehículo NO está en consignación.
 */
export function activeConsignmentDealership(
  vehicle: Pick<Vehicle, "ownerships"> | null | undefined,
): { id: string; name: string; logoUrl?: string | null } | null {
  const ownership = vehicle?.ownerships?.find(
    (o): o is VehicleOwnership & { dealership: NonNullable<VehicleOwnership["dealership"]> } =>
      Boolean(!o.endsAt && o.type === "company" && o.dealership?.name),
  );
  return ownership?.dealership ?? null;
}

const DEALERSHIP_ROLE_LABELS: Record<string, string> = {
  owner: "Dueño",
  admin: "Administrativo",
  seller: "Vendedor",
};

/** Label español del rol de concesionaria (RB-10; fallback al código crudo). */
export function dealershipRoleLabel(code?: string | null): string {
  if (!code) return "—";
  return DEALERSHIP_ROLE_LABELS[code] ?? code;
}

/** Labels del schedule del QR de toma (D-104, RB-11). */
export const CONSIGNMENT_SCHEDULE_LABELS: Record<
  "immediate" | "pickup",
  string
> = {
  immediate: "Inmediata (1 hora)",
  pickup: "Retiro diferido (48 horas)",
};

/** Label de la franja de tiempo para el QR generado (take). */
export function consignmentScheduleLabel(
  schedule: "immediate" | "pickup",
): string {
  return CONSIGNMENT_SCHEDULE_LABELS[schedule];
}