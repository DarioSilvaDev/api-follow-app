/**
 * Tipos del workspace admin de plataforma — secciones concesionarias Y talleres
 * (features "Onboarding administrado de concesionaria" y "Onboarding admin de
 * taller" D-106 — decisiones PM cerradas).
 *
 * Contrato backend congelado:
 * - GET  /api/admin/dealerships?page&limit&status
 * - POST /api/admin/dealerships  { name, taxId?, ownerEmail }
 * - POST /api/admin/dealerships/:id/invitations (reenvío)
 * - GET  /api/admin/workshops?page&limit&status
 * - POST /api/admin/workshops  { name, taxId?, ownerEmail }
 * - POST /api/admin/workshops/:id/invitations (reenvío)
 * - GET  /api/admin/workshops/:id (detalle admin con branches + members)
 * - PATCH /api/admin/workshops/:id/status { isActive }
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

/* ------------------------------------------------------------------ */
/* Talleres (admin) — espejo D-106 de concesionarias                   */
/* ------------------------------------------------------------------ */

export type AdminWorkshopStatus = "pending_claim" | "active";

/** `GET /api/admin/workshops` → item del envelope (WorkshopAdminResponseDto). */
export interface AdminWorkshopItem {
  id: string;
  name: string;
  legalName: string | null;
  taxId: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  status: AdminWorkshopStatus;
  isActive: boolean;
  owner: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
  invitation: {
    id: string;
    email: string;
    expiresAt: string;
    status: string;
  } | null;
  claimedAt: string | null;
  ownerName: string | null;
  ownerEmail: string | null;
  branchesCount: number;
  membersCount: number;
  createdAt: string;
}

/** `GET /api/admin/workshops` → envelope { data, meta }. */
export interface AdminWorkshopListResponse {
  data: AdminWorkshopItem[];
  meta: AdminDealershipListMeta;
}

/** `POST /api/admin/workshops` → body (nombre*, CUIT opcional, email dueño*). */
export interface CreateAdminWorkshopInput {
  name: string;
  taxId?: string;
  ownerEmail: string;
}

/** `POST /api/admin/workshops` → 201 (espejo de concesionarias). */
export interface CreateAdminWorkshopResult {
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

/** `POST /api/admin/workshops/:id/invitations` → 200 (reenvío). */
export interface ResendWorkshopInvitationResult {
  invitation: {
    id: string;
    email: string;
    expiresAt: string;
    status: string;
  };
}

/** Sucursal dentro del detalle admin (WorkshopBranchAdminResponseDto). */
export interface AdminWorkshopBranch {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  street: string | null;
  streetNumber: string | null;
  city: string | null;
  state: string | null;
  isHeadquarters: boolean;
  isActive: boolean;
}

/** Miembro dentro del detalle admin (WorkshopMemberBriefDto). */
export interface AdminWorkshopMember {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  roleCode: string;
  roleName: string;
  status: string;
  joinedAt: string;
}

/** `GET /api/admin/workshops/:id` → 200 (WorkshopDetailAdminResponseDto). */
export interface AdminWorkshopDetail {
  id: string;
  name: string;
  legalName: string | null;
  taxId: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  logoUrl: string | null;
  description: string | null;
  status: AdminWorkshopStatus;
  isActive: boolean;
  claimedAt: string | null;
  createdAt: string;
  updatedAt: string;
  branches: AdminWorkshopBranch[];
  members: AdminWorkshopMember[];
}

/** `PATCH /api/admin/workshops/:id/status` → body. */
export interface UpdateAdminWorkshopStatusInput {
  isActive: boolean;
}