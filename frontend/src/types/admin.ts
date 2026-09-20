/**
 * Tipos del workspace admin de plataforma — sección concesionarias
 * (feature "Onboarding administrado de concesionaria" — decisiones PM cerradas).
 *
 * Contrato backend congelado (permisos admin.dealerships.list / create / manage):
 * - GET  /api/admin/dealerships?page&limit&status
 * - POST /api/admin/dealerships  { name, taxId?, ownerEmail }
 * - POST /api/admin/dealerships/:id/invitations (reenvío)
 */

export type AdminDealershipStatus = "pending_claim" | "active";

/** `GET /api/admin/dealerships` → item del envelope. */
export interface AdminDealershipItem {
  id: string;
  name: string;
  taxId: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  status: AdminDealershipStatus;
  isActive: boolean;
  createdAt: string;
  owner: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
  invitation: {
    id: string;
    status: string;
    expiresAt: string;
  } | null;
  memberCount: number;
}

export interface AdminDealershipListMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/** `GET /api/admin/dealerships` → envelope { data, meta }. */
export interface AdminDealershipListResponse {
  data: AdminDealershipItem[];
  meta: AdminDealershipListMeta;
}

/** `POST /api/admin/dealerships` → body (nombre*, CUIT opcional, email dueño*). */
export interface CreateAdminDealershipInput {
  name: string;
  taxId?: string;
  ownerEmail: string;
}

/** `POST /api/admin/dealerships` → 201. */
export interface CreateAdminDealershipResult {
  id: string;
  name: string;
  taxId: string | null;
  email: string | null;
  status: "pending_claim";
  isActive: boolean;
  createdAt: string;
  invitation: {
    id: string;
    email: string;
    expiresAt: string;
    status: string;
  };
}

/** `POST /api/admin/dealerships/:id/invitations` → 200 (reenvío). */
export interface ResendInvitationResult {
  invitation: {
    id: string;
    email: string;
    expiresAt: string;
    status: string;
  };
}