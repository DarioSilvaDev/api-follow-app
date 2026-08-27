export interface AuthenticatedUser {
  id: string;
  email: string;
  impersonated?: boolean;
  impersonatedBy?: string;
}

export interface ResolvedPermissions {
  systemRoles: string[];
  permissions: Set<string>;
}
