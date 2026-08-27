export class RoleDto {
  id!: string;
  type!: string;
  name!: string;
  permissions?: string[];

  static from(
    assignment: {
      role: {
        id: string;
        type: string;
        name: string;
        permissions?: { permission: { code: string } }[];
      };
    },
    includePermissions = false,
  ): RoleDto {
    const base = {
      id: assignment.role.id,
      type: assignment.role.type,
      name: assignment.role.name,
    };

    if (!includePermissions) return base;

    return {
      ...base,
      permissions:
        assignment.role.type === 'super_admin'
          ? ['*']
          : (assignment.role.permissions?.map((rp) => rp.permission.code) ??
            []),
    };
  }
}
