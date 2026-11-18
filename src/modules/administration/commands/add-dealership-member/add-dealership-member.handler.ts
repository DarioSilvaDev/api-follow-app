import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../../../common/database/prisma.service';
import { PermissionCache } from '../../../../common/cache/permission-cache';
import { AddDealershipMemberCommand } from './add-dealership-member.command';

/**
 * Alta directa de miembro desde el panel de administración (superadmin/admin).
 * Espejo de `AddMemberHandler` (workshops admin), con dos diferencias
 * deliberadas:
 *  - invalidación de cache con `invalidateUser` (cubre todos los contextos
 *    del usuario, espejo del módulo de concesionarias);
 *  - si existía una membresía `inactive` previa, se reactiva con el rol
 *    indicado en lugar de fallar con el `@@unique([dealershipId, userId])`.
 */
@Injectable()
export class AddDealershipMemberHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissionCache: PermissionCache,
  ) {}

  async execute(command: AddDealershipMemberCommand) {
    const dealership = await this.prisma.dealership.findUnique({
      where: { id: command.dealershipId },
    });
    if (!dealership || dealership.deletedAt) {
      throw new NotFoundException('Dealership', command.dealershipId);
    }

    const email = command.dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email },
    });
    if (!user || user.deletedAt) {
      throw new NotFoundException('User', `email ${email}`);
    }

    const role = await this.prisma.dealershipRole.findUnique({
      where: { id: command.dto.roleId },
    });
    if (!role || role.dealershipId !== command.dealershipId) {
      throw new NotFoundException('DealershipRole', command.dto.roleId);
    }

    const existing = await this.prisma.dealershipMember.findUnique({
      where: {
        dealershipId_userId: {
          dealershipId: command.dealershipId,
          userId: user.id,
        },
      },
    });

    if (existing && existing.status !== 'inactive') {
      throw new ConflictException(
        'User is already a member of this dealership',
      );
    }

    if (existing) {
      const reactivated = await this.prisma.dealershipMember.update({
        where: { id: existing.id },
        data: {
          status: 'active',
          roleId: role.id,
          leftAt: null,
        },
      });
      this.permissionCache.invalidateUser(user.id);
      return { ...reactivated, reactivated: true };
    }

    const member = await this.prisma.dealershipMember.create({
      data: {
        dealershipId: command.dealershipId,
        userId: user.id,
        roleId: role.id,
        status: 'active',
        joinedAt: new Date(),
      },
    });

    this.permissionCache.invalidateUser(user.id);

    return { ...member, reactivated: false };
  }
}
