import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../../../common/database/prisma.service';
import { PermissionCache } from '../../../../common/cache/permission-cache';
import { UpdateMemberRoleCommand } from './update-member-role.command';

@Injectable()
export class UpdateMemberRoleHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissionCache: PermissionCache,
  ) {}

  async execute(command: UpdateMemberRoleCommand) {
    const member = await this.prisma.dealershipMember.findUnique({
      where: { id: command.memberId },
    });
    if (!member) {
      throw new NotFoundException('DealershipMember', command.memberId);
    }

    const targetRole = await this.prisma.dealershipRole.findUnique({
      where: { id: command.roleId },
    });
    if (!targetRole || targetRole.dealershipId !== member.dealershipId) {
      throw new NotFoundException('DealershipRole', command.roleId);
    }

    // Actor: la membresía del usuario actuante en la MISMA concesionaria.
    // La ruta está protegida por DealershipGuard + PermissionsGuard
    // (dealership.members.role.update), por lo que este es el actor
    // autoritativo para el chequeo de jerarquía (RB-10).
    const actorMember = await this.prisma.dealershipMember.findUnique({
      where: {
        dealershipId_userId: {
          dealershipId: member.dealershipId,
          userId: command.actorUserId,
        },
      },
      include: { role: true },
    });
    if (!actorMember || actorMember.status !== 'active') {
      throw new ForbiddenException(
        'You are not an active member of this dealership',
      );
    }

    this.assertHierarchy(actorMember, member, targetRole);

    const updated = await this.prisma.dealershipMember.update({
      where: { id: command.memberId },
      data: { roleId: command.roleId },
    });

    // Invalidate the affected user's cached permissions (dealership-scoped and global).
    this.permissionCache.invalidateUser(member.userId);

    return updated;
  }

  /**
   * Jerarquía de roles de concesionaria — RB-10 (resolución PM §8).
   *
   * El rango se deriva de `DealershipRole.priority`, donde un valor mayor es
   * un rol más senior. Roles de sistema sembrados: owner (100) > admin (60) >
   * seller (40). Roles custom siguen el mismo esquema.
   *
   * Reglas (espejo de workshops / Security Review item 8):
   *  1. Owner puede asignar CUALQUIER rol (control total de la concesionaria).
   *  2. Un no-owner no puede asignar un rol de prioridad MAYOR que la propia
   *     (no puede promover a alguien por encima de sí mismo; en particular
   *     no puede asignar owner).
   *  3. Nadie puede cambiarse SU PROPIO rol a uno de prioridad igual o mayor
   *     (no auto-promoción; solo auto-degradación a prioridad menor).
   */
  private assertHierarchy(
    actorMember: { userId: string; role: { code: string; priority: number } },
    targetMember: { userId: string },
    targetRole: { code: string; priority: number },
  ): void {
    const actorRole = actorMember.role;
    const isSelf = actorMember.userId === targetMember.userId;

    if (isSelf) {
      if (targetRole.priority >= actorRole.priority) {
        throw new ForbiddenException(
          'You cannot assign yourself an equal or higher role',
        );
      }
      return;
    }

    if (actorRole.code === 'owner') {
      return; // el owner puede asignar cualquier rol
    }

    if (targetRole.priority > actorRole.priority) {
      throw new ForbiddenException(
        'You cannot assign a role with a higher priority than your own',
      );
    }
  }
}