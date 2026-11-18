import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../../../common/database/prisma.service';
import { PermissionCache } from '../../../../common/cache/permission-cache';
import { UpdateDealershipMemberRoleCommand } from './update-dealership-member-role.command';

/**
 * Cambio de rol de un miembro de concesionaria desde el panel de
 * administración. A diferencia del handler de contexto DEALERSHIP, el
 * superadmin no está sujeto al chequeo de jerarquía RB-10 (override de
 * plataforma), espejo de `UpdateMemberRoleHandler` (workshops admin).
 */
@Injectable()
export class UpdateDealershipMemberRoleHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissionCache: PermissionCache,
  ) {}

  async execute(command: UpdateDealershipMemberRoleCommand) {
    const member = await this.prisma.dealershipMember.findUnique({
      where: { id: command.memberId },
    });
    if (!member || member.status === 'inactive') {
      throw new NotFoundException('DealershipMember', command.memberId);
    }

    const role = await this.prisma.dealershipRole.findUnique({
      where: { id: command.roleId },
    });
    if (!role || role.dealershipId !== member.dealershipId) {
      throw new BadRequestException(
        'Role does not belong to the same dealership',
      );
    }

    const updated = await this.prisma.dealershipMember.update({
      where: { id: command.memberId },
      data: { roleId: command.roleId },
    });

    this.permissionCache.invalidateUser(member.userId);

    return updated;
  }
}
