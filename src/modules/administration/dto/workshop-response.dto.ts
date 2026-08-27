export class WorkshopAdminResponseDto {
  id!: string;
  name!: string;
  legalName!: string | null;
  email!: string | null;
  phone!: string | null;
  isActive!: boolean;
  ownerName!: string | null;
  ownerEmail!: string | null;
  branchesCount!: number;
  membersCount!: number;
  createdAt!: Date;

  static from(workshop: any): WorkshopAdminResponseDto {
    const owner = workshop.members?.find(
      (m: any) => m.role?.code === 'owner',
    )?.user;

    return {
      id: workshop.id,
      name: workshop.name,
      legalName: workshop.legalName,
      email: workshop.email,
      phone: workshop.phone,
      isActive: workshop.isActive,
      ownerName: owner ? `${owner.firstName} ${owner.lastName}` : null,
      ownerEmail: owner?.email ?? null,
      branchesCount:
        workshop._count?.branches ?? workshop.branches?.length ?? 0,
      membersCount: workshop._count?.members ?? workshop.members?.length ?? 0,
      createdAt: workshop.createdAt,
    };
  }
}
