/**
 * D-106: item de concesionaria del panel de administración (GET /admin/dealerships).
 * Espejo de WorkshopAdminResponseDto con foco en el estado de onboarding:
 * - status: pending_claim | active
 * - owner: miembro con rol owner (si la concesionaria ya fue reclamada)
 * - invitation: última invitación pending/accepted (o null)
 */
export class DealershipAdminResponseDto {
  id!: string;
  name!: string;
  taxId!: string | null;
  email!: string | null;
  phone!: string | null;
  website!: string | null;
  status!: string;
  isActive!: boolean;
  owner!: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
  memberCount!: number;
  invitation: {
    id: string;
    email: string;
    expiresAt: Date;
    status: string;
  } | null = null;
  claimedAt!: Date | null;
  createdAt!: Date;

  static from(dealership: any): DealershipAdminResponseDto {
    const owner = dealership.members?.find(
      (m: any) => m.role?.code === 'owner',
    )?.user;

    const latestInvitation = dealership.invitations?.[0];

    return {
      id: dealership.id,
      name: dealership.name,
      taxId: dealership.taxId,
      email: dealership.email,
      phone: dealership.phone,
      website: dealership.website,
      status: dealership.status,
      isActive: dealership.isActive,
      owner: owner
        ? {
            id: owner.id,
            firstName: owner.firstName,
            lastName: owner.lastName,
            email: owner.email,
          }
        : null,
      memberCount:
        dealership._count?.members ?? dealership.members?.length ?? 0,
      invitation: latestInvitation
        ? {
            id: latestInvitation.id,
            email: latestInvitation.email,
            expiresAt: latestInvitation.expiresAt,
            status: latestInvitation.status,
          }
        : null,
      claimedAt: dealership.claimedAt,
      createdAt: dealership.createdAt,
    };
  }
}
