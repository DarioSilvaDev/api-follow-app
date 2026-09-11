/**
 * Workshop types expuestos al frontend (F-020).
 *
 * Fuente: `GET /api/workshops/:id` → `WorkshopResponseDto` (backend existente).
 * El endpoint exige membresía activa (o super_admin) y devuelve las branches
 * activas del taller (sede primero). Subset de `WorkshopBranch` (Prisma) que
 * serializa el backend.
 */

export interface WorkshopBranch {
  id: string;
  workshopId: string;
  name: string;
  phone: string | null;
  email: string | null;
  street: string | null;
  streetNumber: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  postalCode: string | null;
  isHeadquarters: boolean;
  isActive: boolean;
}

/** GET /api/workshops/:id → WorkshopResponseDto (branches activas, sede primero). */
export interface WorkshopDetail {
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
  branches?: WorkshopBranch[];
  memberCount?: number;
  branchCount?: number;
}