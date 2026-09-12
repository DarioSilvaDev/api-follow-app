/**
 * F-020 + iteración 2-2 — CareEpisode frontend types.
 *
 * Alineado con el contrato del módulo `care-episodes` (spec F-020 §7 y spec
 * 2-2 §7):
 * - `GET /api/care-episodes/lookup?plate=` → datos mínimos del vehículo SIN PII
 *   (RF-2): `id`, `licensePlate`, `brand`, `model`, `version`,
 *   `manufactureYear`, `modelYear`.
 * - `POST /api/care-episodes` (check-in, RF-1): body con `vehicleId`, `branchId`
 *   y opcionales del ingreso. El episodio nace en estado `open`.
 * - `POST /api/care-episodes/owner` (RF-1 iteración 2-2): ruta PERSONAL del
 *   propietario; el `source` es constante del path (`owner`), nunca del body
 *   (D-063).
 * - `GET /api/care-episodes/verifications` (RF-4) y
 *   `POST /api/care-episodes/:id/verify` (RF-5): cola de verificaciones del
 *   taller (contexto WORKSHOP).
 *
 * El backend se implementa en paralelo con la spec; estos tipos solo reflejan
 * lo que consume la UI de esta iteración (F-021+ ampliará).
 */

/**
 * Origen del episodio (D-063: fijo e inmutable en la creación). Valores reales
 * del enum Prisma (minúsculas): `workshop` (flujo F-020) / `owner` (ruta
 * `/owner`).
 */
export type CareEpisodeSource = "workshop" | "owner";

/**
 * Nivel de confianza discreto (D-064): `unverified` → "Registrado por el
 * propietario"; `verified` → verificado por taller (solo talleres verifican).
 */
export type CareEpisodeVerification = "unverified" | "verified";

/** GET /api/care-episodes/lookup?plate= → vehículo para el check-in. */
export interface CareEpisodeLookupVehicle {
  id: string;
  licensePlate: string;
  brand: string | null;
  model: string | null;
  version: string | null;
  manufactureYear: number | null;
  modelYear: number | null;
}

/** POST /api/care-episodes — body del check-in (campos expuestos en el form). */
export interface CreateCareEpisodeInput {
  vehicleId: string;
  branchId: string;
  appointmentId?: string;
  mileageIn?: number;
  customerComplaint?: string;
  customerNotes?: string;
}

/**
 * POST /api/care-episodes/owner — body del propietario (RF-1, iteración 2-2).
 * XOR del taller responsable (D-066): `workshopId` (taller de la app) **o**
 * `workshopName` (texto libre), nunca ambos (el backend responde 400 si el XOR
 * no se cumple).
 */
export interface CreateOwnerCareEpisodeInput {
  vehicleId: string;
  title: string;
  /** Fecha del servicio, ISO date `YYYY-MM-DD` (no futura, RF-1). */
  serviceDate: string;
  workshopId?: string;
  workshopName?: string;
  mileageIn?: number;
  notes?: string;
}

/**
 * POST /api/care-episodes → 201 con el episodio `open`. Subset leído por la UI.
 * Los campos de la iteración 2-2 (`source`, `verification`, campos owner) son
 * opcionales: el flujo WORKSHOP de F-020 no los expone en la respuesta.
 */
export interface CareEpisode {
  id: string;
  vehicleId: string;
  workshopId: string;
  branchId: string;
  status: "open" | "delivered" | "cancelled";
  mileageIn: number | null;
  customerComplaint: string | null;
  customerNotes: string | null;
  checkedInAt: string;
  createdAt: string;
  /** Iteración 2-2 (D-063): `source='owner'` en la ruta `/owner`. */
  source?: CareEpisodeSource;
  /** Iteración 2-2 (D-064): `verification='unverified'` al nacer. */
  verification?: CareEpisodeVerification;
  /** Iteración 2-2 (RF-1): requerido en episodios owner. */
  title?: string | null;
  /** Iteración 2-2 (RF-1): requerido en episodios owner (pasada/hoy). */
  serviceDate?: string | null;
  /** Iteración 2-2 (D-066): texto libre XOR `workshopId`. */
  workshopName?: string | null;
  /** Iteración 2-2 (RF-1): autor propietario (auditoría). */
  createdByUserId?: string | null;
}

/**
 * GET /api/care-episodes/verifications — item de la cola de verificaciones del
 * taller (RF-4, iteración 2-2). Solo episodios `source='owner'` +
 * `verification='unverified'` + `workshopId = contexto`, orden `serviceDate`
 * asc (≤50 default). PII mínima: `owner` sin email/teléfono.
 */
export interface CareEpisodeVerificationItem {
  id: string;
  title: string;
  serviceDate: string;
  mileageIn: number | null;
  notes: string | null;
  vehicle: {
    licensePlate: string;
    brand: string | null;
    model: string | null;
    version: string | null;
    manufactureYear: number | null;
  };
  owner: {
    firstName: string;
    lastName: string;
  };
}