import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../common/database/prisma.service';

@Injectable()
export class StopImpersonateHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(adminId: string, targetUserId: string) {
    const session = await this.prisma.impersonationSession.findFirst({
      where: {
        adminId,
        targetUserId,
        expiresAt: { gt: new Date() },
      },
    });

    if (!session) {
      throw new NotFoundException('No active impersonation session found');
    }

    const admin = await this.prisma.user.findUnique({
      where: { id: adminId },
      select: { id: true, status: true },
    });

    if (!admin || admin.status !== 'active') {
      throw new ForbiddenException('Admin user not active');
    }

    await this.prisma.impersonationSession.delete({
      where: { id: session.id },
    });

    return { adminToken: session.adminToken };
  }
}
