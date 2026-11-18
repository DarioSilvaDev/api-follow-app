import { RoleDto } from '../../auth/dto/role.dto';

export class UserAdminResponseDto {
  id!: string;
  email!: string;
  firstName!: string;
  lastName!: string;
  status!: string;
  createdAt!: string;
  roles!: RoleDto[];
  /** Cantidad de membresías de taller activas. Aditivo (panel superadmin). */
  workshopCount!: number;
  /** Cantidad de membresías de concesionaria activas. Aditivo. */
  dealershipCount!: number;
  /** Cantidad de tenencias activas de vehículos. Aditivo. */
  vehicleCount!: number;

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
      workshopCount: user._counts?.workshops ?? 0,
      dealershipCount: user._counts?.dealerships ?? 0,
      vehicleCount: user._counts?.vehicles ?? 0,
    };
  }
}
