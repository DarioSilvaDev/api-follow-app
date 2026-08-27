export class WorkshopBranchAdminResponseDto {
  id!: string;
  name!: string;
  phone!: string | null;
  email!: string | null;
  street!: string | null;
  streetNumber!: string | null;
  city!: string | null;
  state!: string | null;
  isHeadquarters!: boolean;
  isActive!: boolean;

  static from(branch: any): WorkshopBranchAdminResponseDto {
    return {
      id: branch.id,
      name: branch.name,
      phone: branch.phone,
      email: branch.email,
      street: branch.street,
      streetNumber: branch.streetNumber,
      city: branch.city,
      state: branch.state,
      isHeadquarters: branch.isHeadquarters,
      isActive: branch.isActive,
    };
  }
}

export class WorkshopMemberBriefDto {
  id!: string;
  userId!: string;
  userName!: string;
  userEmail!: string;
  roleCode!: string;
  roleName!: string;
  status!: string;
  joinedAt!: Date;

  static from(member: any): WorkshopMemberBriefDto {
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

export class WorkshopDetailAdminResponseDto {
  id!: string;
  name!: string;
  legalName!: string | null;
  taxId!: string | null;
  email!: string | null;
  phone!: string | null;
  website!: string | null;
  logoUrl!: string | null;
  description!: string | null;
  isActive!: boolean;
  createdAt!: Date;
  updatedAt!: Date;
  branches!: WorkshopBranchAdminResponseDto[];
  members!: WorkshopMemberBriefDto[];

  static from(workshop: any): WorkshopDetailAdminResponseDto {
    return {
      id: workshop.id,
      name: workshop.name,
      legalName: workshop.legalName,
      taxId: workshop.taxId,
      email: workshop.email,
      phone: workshop.phone,
      website: workshop.website,
      logoUrl: workshop.logoUrl,
      description: workshop.description,
      isActive: workshop.isActive,
      createdAt: workshop.createdAt,
      updatedAt: workshop.updatedAt,
      branches: (workshop.branches ?? []).map((b: any) =>
        WorkshopBranchAdminResponseDto.from(b),
      ),
      members: (workshop.members ?? []).map((m: any) =>
        WorkshopMemberBriefDto.from(m),
      ),
    };
  }
}
