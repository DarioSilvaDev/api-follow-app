import { Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../../../common/database/prisma.service';
import { CodedHttpException } from '../../../../common/exceptions/coded.exception';
import { ERROR_CODES } from '../../../../common/exceptions/error-codes';
import { PermissionCache } from '../../../../common/cache/permission-cache';
import { hashPasswordResetToken } from '../../../auth/utils/token-hash.util';
import { SystemRoleAssignedEvent } from '../../events/system-role-assigned.event';
import { UserInvitedEvent } from '../../../users/events/user-invited.event';
import { InvitePlatformUserCommand } from './invite-platform-user.command';

/**
 * D-106: invitación de usuario de plataforma desde el panel admin.
 *
 * Flujo por estado de la cuenta destino (email case-insensitive):
 * - cuenta ACTIVE sin el rol → se asigna el rol directamente (sin wizard) y el
 *   event `admin.system_role.assigned` dispara el email de notificación.
 * - cuenta ACTIVE con el rol → 409 CONFLICT ("ya tiene el rol").
 * - cuenta PENDING → se crea la invitación; el wizard claim reactiva la cuenta
 *   y fija la credencial (el login de auth rechaza cuentas pending).
 * - cuenta SUSPENDED → 409 CONFLICT.
 * - cuenta soft-deleted → 409 CONFLICT D-S3 (email bloqueado, ni purge ni restore).
 * - sin cuenta → se crea la invitación (el wizard crea la cuenta activa).
 *
 * Seguridad:
 * - El token se genera con randomBytes(32) y SOLO se persiste su hash (sha256).
 * - El token viaja exclusivamente por email (link `?kind=user`), nunca en la
 *   respuesta HTTP.
 * - Solo roles admin|support (DTO); super_admin se mantiene en el flow existente
 *   de POST /admin/roles/assign.
 */
@Injectable()
export class InvitePlatformUserHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    private readonly permissionCache: PermissionCache,
  ) {}

  async execute(command: InvitePlatformUserCommand) {
    const dto = command.dto;
    const email = dto.email.trim().toLowerCase();

    const role = await this.prisma.systemRole.findUnique({
      where: { type: dto.roleType },
      select: { id: true, type: true, name: true },
    });
    if (!role) {
      throw new NotFoundException('SystemRole', dto.roleType);
    }

    // Cuenta destino case-insensitive, incluyendo soft-deleted (D-S3: hay que
    // distinguir "email libre" de "email de cuenta desactivada").
    const existingUser = await this.prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        status: true,
        deletedAt: true,
      },
    });

    if (existingUser?.deletedAt) {
      throw new CodedHttpException(
        409,
        'Este email está asociado a una cuenta desactivada. Contactá a soporte.',
        ERROR_CODES.CONFLICT,
      );
    }

    if (existingUser?.status === 'suspended') {
      throw new CodedHttpException(
        409,
        'La cuenta está suspendida',
        ERROR_CODES.CONFLICT,
      );
    }

    if (existingUser?.status === 'active') {
      const alreadyAssigned = await this.prisma.systemRoleAssignment.findUnique(
        {
          where: {
            userId_roleId: { userId: existingUser.id, roleId: role.id },
          },
          select: { id: true },
        },
      );
      if (alreadyAssigned) {
        throw new CodedHttpException(
          409,
          `El usuario ya tiene el rol ${role.name}`,
          ERROR_CODES.CONFLICT,
        );
      }

      // Cuenta activa sin rol: se asigna directamente (sin wizard). El evento
      // existente admin.system_role.assigned dispara el email de notificación.
      await this.prisma.systemRoleAssignment.create({
        data: { userId: existingUser.id, roleId: role.id },
      });
      this.permissionCache.invalidateUser(existingUser.id);
      this.eventEmitter.emit(
        'admin.system_role.assigned',
        new SystemRoleAssignedEvent(existingUser.id, role.type),
      );

      return {
        roleAssigned: true,
        user: {
          id: existingUser.id,
          email: existingUser.email,
          firstName: existingUser.firstName,
          lastName: existingUser.lastName,
          status: existingUser.status,
        },
        role: { type: role.type, name: role.name },
        invitation: null,
      };
    }

    // Cuenta pending o inexistente → invitación (wizard claim activa la cuenta).
    const token = randomBytes(32).toString('hex');

    // Dedupe: no crear una segunda invitación si hay una pending vigente.
    const pending = await this.prisma.userInvitation.findFirst({
      where: { email, status: 'pending', expiresAt: { gt: new Date() } },
      select: { id: true },
    });
    if (pending) {
      throw new CodedHttpException(
        409,
        'Ya existe una invitación pendiente para este email',
        ERROR_CODES.CONFLICT,
      );
    }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const invitation = await this.prisma.userInvitation.create({
      data: {
        email,
        roleId: role.id,
        invitedById: command.invitedById,
        firstName: dto.firstName ?? null,
        lastName: dto.lastName ?? null,
        tokenHash: hashPasswordResetToken(token),
        status: 'pending',
        expiresAt,
      },
      select: {
        id: true,
        email: true,
        expiresAt: true,
        status: true,
      },
    });

    this.eventEmitter.emit(
      'user.invited',
      new UserInvitedEvent(email, token, role.type, role.name),
    );

    return {
      roleAssigned: false,
      user: null,
      role: { type: role.type, name: role.name },
      invitation: {
        id: invitation.id,
        email: invitation.email,
        expiresAt: invitation.expiresAt,
        status: invitation.status,
      },
    };
  }
}
