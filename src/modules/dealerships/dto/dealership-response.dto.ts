import { Dealership, DealershipMember } from '@prisma/client';

type DealershipWithRelations = Dealership & {
  members?: DealershipMember[];
  _count?: { members: number };
};

export class DealershipResponseDto {
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
  memberCount?: number;

  static from(d: DealershipWithRelations): DealershipResponseDto {
    return {
      id: d.id,
      name: d.name,
      legalName: d.legalName,
      taxId: d.taxId,
      email: d.email,
      phone: d.phone,
      website: d.website,
      logoUrl: d.logoUrl,
      description: d.description,
      isActive: d.isActive,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
      memberCount: d._count?.members ?? d.members?.length,
    };
  }
}