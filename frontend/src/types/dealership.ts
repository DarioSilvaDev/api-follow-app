/**
 * Dealership (Concesionaria) types — milestone "Cadena de consignación
 * concesionaria" (D-101..D-108, spec docs/specs/vehicle-consignment-flow.md §8).
 *
 * Contrato backend (sección 28 / D-TL-8..D-TL-13):
 * - Módulo `dealerships` espejo de `workshops` (D-102): entidad + roles +
 *   miembros + invitaciones. NO reutiliza tablas de workshops.
 * - `/auth/me` expone `dealershipMemberships` (resolución PM §3.4).
 * - Roles seed: owner / admin / seller (RB-10, D-TL-13).
 *
 * CONTRACT TOLERANCE: el backend llega en fases 1a/2; los campos que la UI
 * lee pero el backend aún no puebla son opcionales (mismo patrón F-010 §9).
 */

/** Shape de `dealershipMemberships` en `/auth/me` (bootstrap del contexto DEALERSHIP). */
export interface DealershipMembership {
  dealershipId: string;
  dealershipName: string;
  logoUrl?: string | null;
  /**
   * Rol del usuario en la concesionaria (espejo de `workshopMemberships[].role`):
   * `{ id, code, name }` — contrato real de `GET /auth/me` (§28 §3.4).
   * `code` = owner | admin | seller (RB-10).
   */
  role: { id: string; code: string; name: string };
}

/** `GET /dealerships/mine` → concesionaria del usuario (miembro). */
export interface Dealership {
  id: string;
  name: string;
  legalName: string | null;
  taxId: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  logoUrl: string | null;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  memberCount?: number;
  vehicleCount?: number;
}

/**
 * `GET /dealerships/mine` → envelope paginado (mismo patrón
 * `VehicleListResponse` / backend `ListDealershipsHandler`):
 * `{ data, meta }`. El frontend NO inventa el shape: lo consume tal cual.
 */
export interface DealershipListMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface DealershipListResponse {
  data: Dealership[];
  meta: DealershipListMeta;
}

/** `GET /dealerships/:id/roles` → roles de la concesionaria (seed RB-10). */
export interface DealershipRoleItem {
  id: string;
  code: string;
  name: string;
}

/** `GET /dealerships/:id/members` → miembro (espejo MemberResponseDto). */
export interface DealershipMember {
  id: string;
  userId?: string | null;
  dealershipId: string;
  roleId: string;
  status: string;
  joinedAt: string;
  leftAt: string | null;
  user?: { id?: string; firstName: string; lastName: string; email: string };
  role?: { id: string; code: string; name: string };
}

/** `POST /dealerships/:id/members` → invitación (espejo InvitationResponseDto). */
export interface DealershipInvitation {
  id: string;
  dealershipId: string;
  roleId: string;
  invitedById: string;
  email: string;
  token: string;
  expiresAt: string;
  status: string;
  acceptedAt: string | null;
  createdAt: string;
  role?: { id: string; code: string; name: string };
}

/** Alta rápida (D-103): datos del negocio + "yo soy el dueño". CUIT opcional. */
export interface CreateDealershipInput {
  name: string;
  legalName?: string;
  taxId?: string;
  email?: string;
  phone?: string;
}

/** PATCH /dealerships/:id → edición de perfil (admin). Campos parciales. */
export interface UpdateDealershipInput {
  name?: string;
  legalName?: string | null;
  taxId?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  description?: string | null;
}

/**
 * `GET /dealerships/:id/vehicles` → vehículos en exhibición (panel de la
 * concesionaria, resolución PM §3.5). Shape acotado: solo lo que lee la UI.
 * `consignedAt` = fecha de entrada a exhibición (ownership activo de la
 * dealership, type company).
 */
export interface DealershipExhibitionVehicle {
  id: string;
  licensePlate: string;
  brand?: string | null;
  model?: string | null;
  version?: string | null;
  manufactureYear?: number | null;
  modelYear?: number | null;
  color?: string | null;
  consignedAt?: string | null;
  photos?: Array<{
    id: string;
    key: string;
    isPrimary: boolean;
    url?: string;
    expiresAt?: string;
  }>;
  mileages?: Array<{ mileage: number; recordedAt: string; source: string }>;
}