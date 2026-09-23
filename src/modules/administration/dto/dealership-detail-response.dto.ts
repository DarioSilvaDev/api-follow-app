/**
 * D-106: detalle de concesionaria del panel de administración
 * (GET /admin/dealerships/:id). Espejo de WorkshopDetailAdminResponseDto con
 * foco en el estado de onboarding:
 * - owner: miembro con rol owner (si la concesionaria ya fue reclamada)
 * - members: lista breve de miembros (misma forma que el detalle de taller)
 * - invitation: última invitación pending/accepted (o null)
 *
 * El token de invitación NUNCA forma parte de la respuesta: en la UI el
 * token viaja solo por email (mismo contrato que el listado y el reenvío).
 */
export class DealershipMemberBriefDto {
  id!: string;
  userId!: string;
  userName!: string;
  userEmail!: string;
  roleCode!: string;
  roleName!: string;
  status!: string;
  joinedAt!: Date;

  static from(member: any): DealershipMemberBriefDto {
    return {
      id: member.id,
      userId: member.userId,
      userName: member.user
        ? `${member.user.firstName} ${member.user.lastName}`
        : 'Unknown',
      userEmail: member.user?.email ?? '',
      roleCode: member.role?.code ?? '',
      roleName: member.role?.name ?? '',
      status: member.status,
      joinedAt: member.joinedAt,
    };
  }
}

export class DealershipDetailAdminResponseDto {
  id!: string;
  name!: string;
  legalName!: string | null;
  taxId!: string | null;
  email!: string | null;
  phone!: string | null;
  website!: string | null;
  logoUrl!: string | null;
  description!: string | null;
  status!: string;
  isActive!: boolean;
  claimedAt!: Date | null;
  createdAt!: Date;
  updatedAt!: Date;
  owner!: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
  members!: DealershipMemberBriefDto[];
  invitation: {
    id: string;
    email: string;
    expiresAt: Date;
    status: string;
  } | null = null;

  static from(dealership: any): DealershipDetailAdminResponseDto {
    const owner = dealership.members?.find(
      (m: any) => m.role?.code === 'owner',
    )?.user;

    const latestInvitation = dealership.invitations?.[0];

    return {
      id: dealership.id,
      name: dealership.name,
      legalName: dealership.legalName,
      taxId: dealership.taxId,
      email: dealership.email,
      phone: dealership.phone,
      website: dealership.website,
      logoUrl: dealership.logoUrl,
      description: dealership.description,
      status: dealership.status,
      isActive: dealership.isActive,
      claimedAt: dealership.claimedAt,
      createdAt: dealership.createdAt,
      updatedAt: dealership.updatedAt,
      owner: owner
        ? {
            id: owner.id,
            firstName: owner.firstName,
            lastName: owner.lastName,
            email: owner.email,
          }
        : null,
      members: (dealership.members ?? []).map((m: any) =>
        DealershipMemberBriefDto.from(m),
      ),
      invitation: latestInvitation
        ? {
            id: latestInvitation.id,
            email: latestInvitation.email,
            expiresAt: latestInvitation.expiresAt,
            status: latestInvitation.status,
          }
        : null,
    };
  }
}