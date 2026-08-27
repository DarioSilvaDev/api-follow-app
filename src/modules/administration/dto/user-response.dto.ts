import { RoleDto } from '../../auth/dto/role.dto';

export class UserAdminResponseDto {
  id!: string;
  email!: string;
  firstName!: string;
  lastName!: string;
  status!: string;
  createdAt!: string;
  roles!: RoleDto[];

  static from(user: any): UserAdminResponseDto {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      status: user.status,
      createdAt: user.createdAt,
      roles: (user.systemRoleAssignments ?? []).map((a: any) =>
        RoleDto.from(a, false),
      ),
    };
  }
}
