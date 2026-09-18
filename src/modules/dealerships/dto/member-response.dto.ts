import { DealershipMember } from '@prisma/client';

export class MemberResponseDto {
  id!: string;
  userId!: string;
  dealershipId!: string;
  roleId!: string;
  status!: string;
  joinedAt!: Date;
  leftAt!: Date | null;
  user?: { id: string; firstName: string; lastName: string; email: string };
  role?: { id: string; code: string; name: string };

  static from(
    m: DealershipMember & {
      user?: { id: string; firstName: string; lastName: string; email: string };
      role?: { id: string; code: string; name: string };
    },
  ): MemberResponseDto {
    return {
      id: m.id,
      userId: m.userId,
      dealershipId: m.dealershipId,
      roleId: m.roleId,
      status: m.status,
      joinedAt: m.joinedAt,
      leftAt: m.leftAt,
      user: m.user,
      role: m.role,
    };
  }
}