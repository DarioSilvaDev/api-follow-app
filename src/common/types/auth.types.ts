export interface AuthenticatedUser {
  id: string;
  email: string;
}

export interface ResolvedPermissions {
  systemRoles: string[];
  permissions: Set<string>;
}
