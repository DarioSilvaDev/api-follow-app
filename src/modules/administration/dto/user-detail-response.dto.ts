import { RoleDto } from '../../auth/dto/role.dto';

export class WorkshopMembershipSummaryDto {
  id!: string;
  workshopId!: string;
  workshopName!: string;
  workshopStatus!: string;
  roleId!: string;
  roleCode!: string;
  roleName!: string;
  defaultBranchId!: string | null;
  defaultBranchName!: string | null;
  status!: string;
  joinedAt!: Date;
  leftAt!: Date | null;

  static from(membership: any): WorkshopMembershipSummaryDto {
    return {
      id: membership.id,
      workshopId: membership.workshopId,
      workshopName: membership.workshop?.name ?? '',
      workshopStatus: membership.workshop?.status ?? '',
      roleId: membership.roleId,
      roleCode: membership.role?.code ?? '',
      roleName: membership.role?.name ?? '',
      defaultBranchId: membership.defaultBranchId ?? null,
      defaultBranchName: membership.defaultBranch?.name ?? null,
      status: membership.status,
      joinedAt: membership.joinedAt,
      leftAt: membership.leftAt ?? null,
    };
  }
}

export class DealershipMembershipSummaryDto {
  id!: string;
  dealershipId!: string;
  dealershipName!: string;
  dealershipStatus!: string;
  dealershipIsActive!: boolean;
  roleId!: string;
  roleCode!: string;
  roleName!: string;
  status!: string;
  joinedAt!: Date;
  leftAt!: Date | null;

  static from(membership: any): DealershipMembershipSummaryDto {
    return {
      id: membership.id,
      dealershipId: membership.dealershipId,
      dealershipName: membership.dealership?.name ?? '',
      dealershipStatus: membership.dealership?.status ?? '',
      dealershipIsActive: membership.dealership?.isActive ?? true,
      roleId: membership.roleId,
      roleCode: membership.role?.code ?? '',
      roleName: membership.role?.name ?? '',
      status: membership.status,
      joinedAt: membership.joinedAt,
      leftAt: membership.leftAt ?? null,
    };
  }
}

const vehicleBrand = (vehicle: any): string | null =>
  vehicle?.version?.model?.brand?.name ?? vehicle?.brandName ?? null;
const vehicleModel = (vehicle: any): string | null =>
  vehicle?.version?.model?.name ?? vehicle?.modelName ?? null;
const vehicleVersion = (vehicle: any): string | null =>
  vehicle?.version?.name ?? null;

export class UserVehicleSummaryDto {
  id!: string;
  vehicleId!: string;
  licensePlate!: string;
  brand!: string | null;
  model!: string | null;
  version!: string | null;
  color!: string | null;
  manufactureYear!: number | null;
  ownershipType!: string;
  startsAt!: Date;
  /** Nombre de la concesionaria si la tenencia es consignada (ownership sin userId del titular actual). */
  dealershipName!: string | null;

  static from(ownership: any): UserVehicleSummaryDto {
    return {
      id: ownership.id,
      vehicleId: ownership.vehicleId,
      licensePlate: ownership.vehicle?.licensePlate ?? '',
      brand: vehicleBrand(ownership.vehicle),
      model: vehicleModel(ownership.vehicle),
      version: vehicleVersion(ownership.vehicle),
      color: ownership.vehicle?.color ?? null,
      manufactureYear: ownership.vehicle?.manufactureYear ?? null,
      ownershipType: ownership.type,
      startsAt: ownership.startsAt,
      dealershipName: ownership.dealership?.name ?? null,
    };
  }
}

export class UserVehicleAccessSummaryDto {
  id!: string;
  vehicleId!: string;
  licensePlate!: string;
  brand!: string | null;
  model!: string | null;
  version!: string | null;
  color!: string | null;
  expiresAt!: Date | null;
  grantedByName!: string;
  grantedByEmail!: string;
  createdAt!: Date;

  static from(access: any): UserVehicleAccessSummaryDto {
    const grantedBy = access.grantedBy;
    return {
      id: access.id,
      vehicleId: access.vehicleId,
      licensePlate: access.vehicle?.licensePlate ?? '',
      brand: vehicleBrand(access.vehicle),
      model: vehicleModel(access.vehicle),
      version: vehicleVersion(access.vehicle),
      color: access.vehicle?.color ?? null,
      expiresAt: access.expiresAt ?? null,
      grantedByName: grantedBy
        ? `${grantedBy.firstName} ${grantedBy.lastName}`
        : 'Unknown',
      grantedByEmail: grantedBy?.email ?? '',
      createdAt: access.createdAt,
    };
  }
}

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
  /** Membresías de taller vigentes (activas/pendientes/suspendidas). Aditivo. */
  workshopMemberships!: WorkshopMembershipSummaryDto[];
  /** Membresías de concesionaria vigentes (activas/pendientes/suspendidas). Aditivo. */
  dealershipMemberships!: DealershipMembershipSummaryDto[];
  /** Historial: membresías de taller inactivas (baja suave). Aditivo. */
  inactiveWorkshopMemberships!: WorkshopMembershipSummaryDto[];
  /** Historial: membresías de concesionaria inactivas (baja suave). Aditivo. */
  inactiveDealershipMemberships!: DealershipMembershipSummaryDto[];
  /** Tenencias activas de vehículos del usuario. Aditivo. */
  vehicles!: UserVehicleSummaryDto[];
  /** Accesos vigentes a vehículos de terceros. Aditivo. */
  vehicleAccesses!: UserVehicleAccessSummaryDto[];

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
      workshopMemberships: (user.workshopMemberships ?? []).map((m: any) =>
        WorkshopMembershipSummaryDto.from(m),
      ),
      dealershipMemberships: (user.dealershipMemberships ?? []).map((m: any) =>
        DealershipMembershipSummaryDto.from(m),
      ),
      inactiveWorkshopMemberships: (user.inactiveWorkshopMemberships ?? []).map(
        (m: any) => WorkshopMembershipSummaryDto.from(m),
      ),
      inactiveDealershipMemberships: (
        user.inactiveDealershipMemberships ?? []
      ).map((m: any) => DealershipMembershipSummaryDto.from(m)),
      vehicles: (user.ownerships ?? []).map((o: any) =>
        UserVehicleSummaryDto.from(o),
      ),
      vehicleAccesses: (user.vehicleAccesses ?? []).map((a: any) =>
        UserVehicleAccessSummaryDto.from(a),
      ),
    };
  }
}
