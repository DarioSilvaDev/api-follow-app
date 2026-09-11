/**
 * F-020 — CareEpisode frontend types.
 *
 * Alineado con el contrato del módulo `care-episodes` (spec F-020 §7):
 * - `GET /api/care-episodes/lookup?plate=` → datos mínimos del vehículo SIN PII
 *   (RF-2): `id`, `licensePlate`, `brand`, `model`, `version`,
 *   `manufactureYear`, `modelYear`.
 * - `POST /api/care-episodes` (check-in, RF-1): body con `vehicleId`, `branchId`
 *   y opcionales del ingreso. El episodio nace en estado `open`.
 *
 * El backend ya está implementado en paralelo con la spec; estos tipos solo
 * reflejan lo que consume la UI de esta iteración (F-021+ ampliará).
 */

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

/** POST /api/care-episodes → 201 con el episodio `open`. Subset leído por la UI. */
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
}