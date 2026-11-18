/**
 * Contrato admin de membresía de concesionaria (panel superadmin).
 * Espejo de `WorkshopMemberAdminResponseDto`.
 */
export class DealershipMemberAdminResponseDto {
  id!: string;
  userId!: string;
  userName!: string;
  userEmail!: string;
  roleId!: string;
  roleCode!: string;
  roleName!: string;
  status!: string;
  joinedAt!: Date;

  static from(member: any): DealershipMemberAdminResponseDto {
    return {
      id: member.id,
      userId: member.userId,
      userName: member.user
        ? `${member.user.firstName} ${member.user.lastName}`
        : 'Unknown',
      userEmail: member.user?.email ?? '',
      roleId: member.roleId,
      roleCode: member.role?.code ?? '',
      roleName: member.role?.name ?? '',
      status: member.status,
      joinedAt: member.joinedAt,
    };
  }
}
