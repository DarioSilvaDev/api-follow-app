import { RoleDto } from '../../auth/dto/role.dto';

export class UserDetailAdminResponseDto {
  id!: string;
  email!: string;
  firstName!: string;
  lastName!: string;
  phone!: string | null;
  avatarUrl!: string | null;
  language!: string;
  status!: string;
  emailVerifiedAt!: Date | null;
  lastLoginAt!: Date | null;
  createdAt!: Date;
  updatedAt!: Date;
  roles!: RoleDto[];

  static from(user: any): UserDetailAdminResponseDto {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      avatarUrl: user.avatarUrl,
      language: user.language,
      status: user.status,
      emailVerifiedAt: user.emailVerifiedAt,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      roles: (user.systemRoleAssignments ?? []).map((a: any) =>
        RoleDto.from(a, false),
      ),
    };
  }
}
