import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../../common/database/prisma.service';
import { PermissionCache } from '../../../../common/cache/permission-cache';
import { RemoveDealershipMemberCommand } from './remove-dealership-member.command';

/**
 * Remoción (soft) de un miembro de concesionaria desde el panel de
 * administración: marca la membresía como `inactive` y sella `leftAt`.
 * Espejo de `RemoveMemberHandler` (workshops admin).
 */
@Injectable()
export class RemoveDealershipMemberHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissionCache: PermissionCache,
  ) {}

  async execute(command: RemoveDealershipMemberCommand) {
    const member = await this.prisma.dealershipMember.findUnique({
      where: { id: command.memberId },
    });
    if (!member || member.status === 'inactive') {
      throw new NotFoundException('DealershipMember', command.memberId);
    }

    await this.prisma.dealershipMember.update({
      where: { id: command.memberId },
      data: { status: 'inactive', leftAt: new Date() },
    });

    this.permissionCache.invalidateUser(member.userId);
  }
}
