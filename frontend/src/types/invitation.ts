/**
 * Tipos del wizard público de invitación (feature "Onboarding administrado").
 *
 * El MISMO wizard `/invitations/[token]` sirve para concesionarias, talleres
 * (D-106 espejo workshops) y usuarios de plataforma (D-106 users wizard): el
 * tipo de entidad se deriva del preview (el backend expone un endpoint por
 * entidad con el mismo contrato de errores).
 *
 * Contrato backend congelado (espejo dealership/workshop):
 * - GET  /api/dealerships/wizard/invitations/:token  (PÚBLICO)
 * - POST /api/dealerships/wizard/claim               (PÚBLICO, auth opcional por cookie)
 * - GET  /api/workshops/wizard/invitations/:token    (PÚBLICO)
 * - POST /api/workshops/wizard/claim                 (PÚBLICO, auth opcional por cookie)
 * - GET  /api/users/wizard/invitations/:token        (PÚBLICO, throttle 10/60s)
 * - POST /api/users/wizard/claim                     (PÚBLICO, throttle 5/300s;
 *   el body NO lleva email — lo fija la invitación)
 *
 * Errores por code: INVITATION_INVALID (404), INVITATION_EXPIRED (400),
 * INVITATION_USED (409), INVITATION_CANCELLED (409). El frontend NUNCA
 * muestra el mensaje crudo (src/lib/invitation-errors.ts lo mapea).
 */

/** Tipo de entidad del wizard público (onboarding admin). */
export type InvitationKind = "dealership" | "workshop" | "user";

/** `GET /api/dealerships/wizard/invitations/:token` → respuesta 200. */
export interface InvitationClaimPreview {
  valid: boolean;
  status: string;
  expiresAt: string;
  dealership: { id: string; name: string };
  email: string;
  account: { exists: boolean; status: string | null };
  requiresRegister: boolean;
}

/** `GET /api/workshops/wizard/invitations/:token` → respuesta 200. */
export interface WorkshopClaimPreview {
  valid: boolean;
  status: string;
  expiresAt: string;
  workshop: { id: string; name: string };
  email: string;
  account: { exists: boolean; status: string | null };
  requiresRegister: boolean;
}

/** Datos opcionales de la concesionaria dentro del claim (paso 2 del wizard). */
export interface InvitationClaimDealershipInput {
  email?: string;
  phone?: string;
  website?: string;
  description?: string;
}

/** Datos opcionales del taller dentro del claim (paso 2 del wizard). */
export interface WorkshopClaimInput {
  email?: string;
  phone?: string;
  website?: string;
  description?: string;
}

/** `POST /api/workshops/wizard/claim` → body (mismo contrato que dealership). */
export interface WorkshopClaimPayload {
  token: string;
  email: string;
  firstName?: string;
  lastName?: string;
  password?: string;
  phone?: string;
  workshop?: WorkshopClaimInput;
}

/**
 * `POST /api/dealerships/wizard/claim` → body.
 * - requiresRegister=true  → el paso 1 del wizard recopila firstName/lastName/
 *   phone/password y TODO se envía en el claim (el backend crea/activa la cuenta).
 * - requiresRegister=false → el usuario ya tiene cuenta (login con cookies) y
 *   el claim NO incluye credenciales; solo token/email + dealership.
 */
export interface InvitationClaimInput {
  token: string;
  email: string;
  firstName?: string;
  lastName?: string;
  password?: string;
  phone?: string;
  dealership?: InvitationClaimDealershipInput;
}

/** `POST /api/dealerships/wizard/claim` → respuesta 201. */
export interface InvitationClaimResult {
  user: { id: string; email: string; firstName: string; lastName: string };
  dealership: { id: string; name: string; status: "active" };
  member: {
    id: string;
    role: { code: string };
  };
}

/** `POST /api/workshops/wizard/claim` → respuesta 201. */
export interface WorkshopClaimResult {
  user: { id: string; email: string; firstName: string; lastName: string };
  workshop: { id: string; name: string; status: "active" };
  member: {
    id: string;
    role: { code: string };
  };
}

// ---------------------------------------------------------------------------
// Wizard público de USUARIOS de plataforma (D-106, espejo dealership/workshop)
//
// Contrato backend verificado (user-wizard.controller.ts + wizard-validation
// handler + wizard-claim handler, src/modules/users):
// - GET  /api/users/wizard/invitations/:token  (PÚBLICO, throttle 10/60s)
//   → 200 preview. La respuesta JAMÁS dispara refresh 401 (contrato: token
//   inválido/vencido/usado → 404/400/409). Shape:
//   { valid, status, expiresAt, role:{type,name}, email,
//     account:{exists,status}, requiresRegister }
// - POST /api/users/wizard/claim               (PÚBLICO, throttle 5/300s)
//   → 201. IMPORTANTE (drift corregido): el body NO lleva `email` — el email
//   viene de la invitación (token). Body:
//   { token, firstName?, lastName?, password?, phone? }
//   El back trata cuenta inexistente / pending / active / suspended / soft-
//   deleted de forma diferente (ver invariant de usuario en el handler):
//   - inexistente o pending → exige firstName/lastName/password (requiereRegister)
//   - active/suspended/soft-deleted → 409 CONFLICT (no es claim de vincular).
//   El user del result SIEMPRE incluye `status` (active tras el claim).
// ---------------------------------------------------------------------------

/** `GET /api/users/wizard/invitations/:token` → respuesta 200 (preview). */
export interface UserWizardClaimPreview {
  valid: boolean;
  /** Estado de la invitación (devuelto por el backend tal cual). */
  status: "pending" | "claimed" | "expired" | "cancelled";
  expiresAt: string;
  /** Rol PLATFORM asignado por la invitación (admin|support). */
  role: { type: string; name: string };
  email: string;
  account: { exists: boolean; status: string | null };
  /** true si la cuenta destino NO existe o está pending (pide register en el claim). */
  requiresRegister: boolean;
}

/** `POST /api/users/wizard/claim` → body (SIN email — viene de la invitación). */
export interface UserWizardClaimInput {
  token: string;
  firstName?: string;
  lastName?: string;
  password?: string;
  phone?: string;
}

/** `POST /api/users/wizard/claim` → respuesta 201. */
export interface UserWizardClaimResult {
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    status: string;
  };
  /** Rol PLATFORM efectivo tras el claim. */
  role: { type: string; name: string };
}