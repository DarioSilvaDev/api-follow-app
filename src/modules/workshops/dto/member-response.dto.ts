import { WorkshopMember } from '@prisma/client';

export class MemberResponseDto {
  id!: string;
  userId!: string;
  workshopId!: string;
  roleId!: string;
  defaultBranchId!: string | null;
  status!: string;
  joinedAt!: Date;
  leftAt!: Date | null;
  user?: { id: string; firstName: string; lastName: string; email: string };
  role?: { id: string; code: string; name: string };

  static from(
    m: WorkshopMember & {
      user?: { id: string; firstName: string; lastName: string; email: string };
      role?: { id: string; code: string; name: string };
    },
  ): MemberResponseDto {
    return {
      id: m.id,
      userId: m.userId,
      workshopId: m.workshopId,
      roleId: m.roleId,
      defaultBranchId: m.defaultBranchId,
      status: m.status,
      joinedAt: m.joinedAt,
      leftAt: m.leftAt,
      user: m.user,
      role: m.role,
    };
  }
}
