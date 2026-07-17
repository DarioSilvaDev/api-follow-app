export class UserAdminResponseDto {
  id!: string;
  email!: string;
  firstName!: string;
  lastName!: string;
  status!: string;
  systemRoles!: { id: string; type: string; name: string }[];

  static from(user: any): UserAdminResponseDto {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      status: user.status,
      systemRoles: (user.systemRoleAssignments ?? []).map((a: any) => ({
        id: a.role.id,
        type: a.role.type,
        name: a.role.name,
      })),
    };
  }
}
