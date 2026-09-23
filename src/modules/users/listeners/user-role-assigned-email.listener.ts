import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../../common/database/prisma.service';
import { MailService } from '../../../common/mail/mail.service';
import { SystemRoleAssignedEvent } from '../../administration/events/system-role-assigned.event';

/**
 * D-106: notifica por email cuando se asigna un rol de plataforma a una cuenta
 * existente (sin wizard). Se reutiliza el evento `admin.system_role.assigned`:
 * - el nuevo flujo POST /admin/users (cuenta activa sin rol) lo emite;
 * - el flujo existente POST /admin/roles/assign también lo emite (efecto
 *   aditivo: esa ruta ahora también notifica por email cuando asigna
 *   admin|support — reportado al Tech Lead).
 *
 * Se limita a roles de plataforma admin|support: asignar super_admin o user
 * sigue sin notificar por email (comportamiento previo preservado).
 *
 * SC-1: los fallos de SMTP post-commit se loguean sin tumbar el proceso.
 */
@Injectable()
export class UserRoleAssignedEmailListener {
  private readonly logger = new Logger(UserRoleAssignedEmailListener.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
  ) {}

  @OnEvent('admin.system_role.assigned', { suppressErrors: true })
  async handle(event: SystemRoleAssignedEvent) {
    if (!this.isPlatformRole(event.roleType)) return;

    try {
      const user = await this.prisma.user.findUnique({
        where: { id: event.userId },
        select: { email: true, deletedAt: true },
      });
      if (!user || user.deletedAt) return;

      const role = await this.prisma.systemRole.findUnique({
        where: { type: event.roleType as never },
        select: { name: true },
      });

      await this.mailService.sendUserRoleAssignedEmail(
        user.email,
        role?.name ?? event.roleType,
      );
    } catch (error) {
      this.logger.error(
        `Failed to send system role assigned email (userId=${event.userId}, roleType=${event.roleType})`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  private isPlatformRole(roleType: string): boolean {
    return roleType === 'admin' || roleType === 'support';
  }
}