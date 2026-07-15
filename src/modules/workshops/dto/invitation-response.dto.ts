import { WorkshopInvitation } from '@prisma/client';

export class InvitationResponseDto {
  id!: string;
  workshopId!: string;
  roleId!: string;
  invitedById!: string;
  email!: string;
  token!: string;
  expiresAt!: Date;
  status!: string;
  acceptedAt!: Date | null;
  createdAt!: Date;
  role?: { id: string; code: string; name: string };
  invitedBy?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  };

  static from(
    inv: WorkshopInvitation & {
      role?: { id: string; code: string; name: string };
      invitedBy?: {
        id: string;
        firstName: string;
        lastName: string;
        email: string;
      };
    },
  ): InvitationResponseDto {
    return {
      id: inv.id,
      workshopId: inv.workshopId,
      roleId: inv.roleId,
      invitedById: inv.invitedById,
      email: inv.email,
      token: inv.token,
      expiresAt: inv.expiresAt,
      status: inv.status,
      acceptedAt: inv.acceptedAt,
      createdAt: inv.createdAt,
      role: inv.role,
      invitedBy: inv.invitedBy,
    };
  }
}
