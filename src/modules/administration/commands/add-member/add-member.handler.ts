import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../../../common/database/prisma.service';
import { PermissionCache } from '../../../../common/cache/permission-cache';
import { AddMemberCommand } from './add-member.command';

/**
 * Alta de miembro de taller desde el panel de administración (superadmin/admin).
 *
 * Fix (alineación con concesionarias — panel superadmin):
 *  - el email se normaliza (`trim().toLowerCase()`);
 *  - el rol se valida ANTES del chequeo de membresía existente;
 *  - si existía una membresía `inactive` (baja suave), se reactiva con el rol
 *    indicado en lugar de responder 409: `status: 'active'`, `leftAt: null`,
 *    `defaultBranchId: null` (evita apuntar a una sucursal de otro taller);
 *    se conserva el `joinedAt` original; no se tocan `invitedAt`/`acceptedAt`/
 *    `lastAccessAt` (metadata histórica del ciclo anterior).
 *  - membresías activas/pendientes/suspendidas siguen devolviendo 409.
 *  - la respuesta incluye `reactivated: true|false` (aditivo) para que el
 *    frontend distinga alta nueva de reactivación.
 *  - invalidación de cache con `invalidateUser` (cubre todos los contextos
 *    del usuario).
 */
@Injectable()
export class AddMemberHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissionCache: PermissionCache,
  ) {}

  async execute(command: AddMemberCommand) {
    const workshop = await this.prisma.workshop.findUnique({
      where: { id: command.workshopId },
    });
    if (!workshop || workshop.deletedAt) {
      throw new NotFoundException('Workshop', command.workshopId);
    }

    const email = command.dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email },
    });
    if (!user || user.deletedAt) {
      throw new NotFoundException('User', `email ${email}`);
    }

    const role = await this.prisma.workshopRole.findUnique({
      where: { id: command.dto.roleId },
    });
    if (!role || role.workshopId !== command.workshopId) {
      throw new NotFoundException('Role', command.dto.roleId);
    }

    const existing = await this.prisma.workshopMember.findUnique({
      where: {
        workshopId_userId: { workshopId: command.workshopId, userId: user.id },
      },
    });

    if (existing && existing.status !== 'inactive') {
      throw new ConflictException('User is already a member of this workshop');
    }

    if (existing) {
      const reactivated = await this.prisma.workshopMember.update({
        where: { id: existing.id },
        data: {
          status: 'active',
          roleId: role.id,
          leftAt: null,
          defaultBranchId: null,
        },
      });
      this.permissionCache.invalidateUser(user.id);
      return { ...reactivated, reactivated: true };
    }

    const member = await this.prisma.workshopMember.create({
      data: {
        workshopId: command.workshopId,
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
