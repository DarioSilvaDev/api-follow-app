/**
 * D-106: item de taller del panel de administración (GET /admin/workshops).
 * Extensión ADITIVA del DTO legacy: conserva todos los campos previos
 * (legalName, ownerName, ownerEmail, branchesCount, membersCount) y agrega el
 * foco del onboarding:
 * - status: pending_claim | active
 * - owner: miembro con rol owner (si el taller ya fue reclamado)
 * - invitation: última invitación pending/accepted (o null)
 * - taxId / website / claimedAt
 */
export class WorkshopAdminResponseDto {
  id!: string;
  name!: string;
  legalName!: string | null;
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
  invitation: {
    id: string;
    email: string;
    expiresAt: Date;
    status: string;
  } | null = null;
  claimedAt!: Date | null;
  ownerName!: string | null;
  ownerEmail!: string | null;
  branchesCount!: number;
  membersCount!: number;
  createdAt!: Date;

  static from(workshop: any): WorkshopAdminResponseDto {
    const owner = workshop.members?.find(
      (m: any) => m.role?.code === 'owner',
    )?.user;

    const latestInvitation = workshop.invitations?.[0];

    return {
      id: workshop.id,
      name: workshop.name,
      legalName: workshop.legalName,
      taxId: workshop.taxId,
      email: workshop.email,
      phone: workshop.phone,
      website: workshop.website,
      status: workshop.status,
      isActive: workshop.isActive,
      owner: owner
        ? {
            id: owner.id,
            firstName: owner.firstName,
            lastName: owner.lastName,
            email: owner.email,
          }
        : null,
      invitation: latestInvitation
        ? {
            id: latestInvitation.id,
            email: latestInvitation.email,
            expiresAt: latestInvitation.expiresAt,
            status: latestInvitation.status,
          }
        : null,
      claimedAt: workshop.claimedAt,
      ownerName: owner ? `${owner.firstName} ${owner.lastName}` : null,
      ownerEmail: owner?.email ?? null,
      branchesCount:
        workshop._count?.branches ?? workshop.branches?.length ?? 0,
      membersCount: workshop._count?.members ?? workshop.members?.length ?? 0,
      createdAt: workshop.createdAt,
    };
  }
}