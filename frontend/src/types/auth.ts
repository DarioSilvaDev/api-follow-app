export interface SessionUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  alias: string | null;
  avatarUrl: string | null;
  language: string;
  status: string;
  isVehicleOwner: boolean;
  roles: Array<{ id: string; type: string; name: string; permissions?: string[] }>;
  workshopMemberships: Array<{
    workshopId: string;
    workshop: { id: string; name: string };
    role: { id: string; code: string; name: string };
  }>;
  /**
   * Milestone consignación (D-102 / resolución PM §3.4): membresías en
   * concesionarias → bootstrap del contexto activo DEALERSHIP.
   * OPCIONAL (aditivo): el backend actual aún no lo expone; la UI tolera su
   * ausencia sin romper el bootstrap de sesión.
   */
  dealershipMemberships?: Array<{
    dealershipId: string;
    dealershipName: string;
    logoUrl?: string | null;
    /** Contrato real de GET /auth/me (§28 §3.4): objeto de rol, espejo de workshopMemberships. */
    role: { id: string; code: string; name: string };
  }>;
}

export interface AuthErrorEnvelope {
  statusCode: number;
  message: string;
  code: string;
  errors?: Record<string, string>;
}
