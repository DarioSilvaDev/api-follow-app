export interface SessionUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
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
}

export interface AuthErrorEnvelope {
  statusCode: number;
  message: string;
  code: string;
  errors?: Record<string, string>;
}
