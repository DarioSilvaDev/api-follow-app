import { Workshop, WorkshopBranch, WorkshopMember } from '@prisma/client';

type WorkshopWithRelations = Workshop & {
  branches?: WorkshopBranch[];
  members?: WorkshopMember[];
  _count?: { members: number; branches: number };
};

export class WorkshopResponseDto {
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
  branches?: WorkshopBranch[];
  memberCount?: number;
  branchCount?: number;

  static from(w: WorkshopWithRelations): WorkshopResponseDto {
    return {
      id: w.id,
      name: w.name,
      legalName: w.legalName,
      taxId: w.taxId,
      email: w.email,
      phone: w.phone,
      website: w.website,
      logoUrl: w.logoUrl,
      description: w.description,
      isActive: w.isActive,
      createdAt: w.createdAt,
      updatedAt: w.updatedAt,
      branches: w.branches,
      memberCount: w._count?.members ?? w.members?.length,
      branchCount: w._count?.branches ?? w.branches?.length,
    };
  }
}
