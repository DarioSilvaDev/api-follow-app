import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { CodedHttpException } from '../../../../common/exceptions/coded.exception';
import { ERROR_CODES } from '../../../../common/exceptions/error-codes';
import {
  InvitationCancelledException,
  InvitationExpiredException,
  InvitationInvalidException,
  InvitationUsedException,
} from '../../../../common/exceptions/coded.exception';
import { PrismaService } from '../../../../common/database/prisma.service';
import { PermissionCache } from '../../../../common/cache/permission-cache';
import { hashPasswordResetToken } from '../../../auth/utils/token-hash.util';
import { UserRegisteredEvent } from '../../../auth/events/user-registered.event';
import { UserClaimedEvent } from '../../events/user-claimed.event';
import { UserWizardClaimCommand } from './wizard-claim.command';

/**
 * D-106: claim del wizard de usuario de plataforma.
 *
 * Flujo (transaccional):
 * 1. Valida token/invitación por hash (404 inválida, 400 expirada, 409 usada/cancelada).
 * 2. El email es el de la invitación (no viene del body).
 * 3. Según el estado de la cuenta destino:
 *    - soft-deleted (deletedAt) → 409 CONFLICT explícito (D-S3);
 *    - inexistente → crea cuenta active + credential + rol de la invitación
 *      (exige firstName/lastName/password);
 *    - pending → reactiva la cuenta, fija la credencial y asigna el rol
 *      (exige el mismo set de datos; el login de auth rechaza cuentas pending);
 *    - active → 409 CONFLICT (el rol ya se asigna por el flujo admin directo);
 *    - suspended → 409 CONFLICT.
 * 5. Marca la invitación `used` (anti doble-claim: updateMany count 0 → rollback).
 *
 * Eventos posteriores al commit: user.claimed y (solo cuenta nueva)
 * auth.user.registered.
 */
@Injectable()
export class UserWizardClaimHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    private readonly permissionCache: PermissionCache,
  ) {}

  async execute(command: UserWizardClaimCommand) {
    const dto = command.dto;

    const invitation = await this.prisma.userInvitation.findUnique({
      where: { tokenHash: hashPasswordResetToken(dto.token) },
      include: {
        role: { select: { id: true, type: true, name: true } },
      },
    });

    if (!invitation) throw new InvitationInvalidException();
    if (invitation.status === 'used') throw new InvitationUsedException();
    if (invitation.status === 'cancelled') {
      throw new InvitationCancelledException();
    }
    if (invitation.expiresAt < new Date())
      throw new InvitationExpiredException();

    const email = invitation.email.toLowerCase();

    // Cuenta destino case-insensitive, incluyendo soft-deleted (D-S3).
    const existingUser = await this.prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
    });

    if (existingUser?.deletedAt) {
      throw new CodedHttpException(
        409,
        'Este email está asociado a una cuenta desactivada. Contactá a soporte.',
        ERROR_CODES.CONFLICT,
      );
    }

    if (existingUser?.status === 'active') {
      throw new CodedHttpException(
        409,
        'Ya existe una cuenta activa con este email',
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

    const isNewUser = !existingUser;
    if (!dto.firstName || !dto.lastName || !dto.password) {
      throw new CodedHttpException(
        400,
        isNewUser
          ? 'firstName, lastName y password son requeridos para crear la cuenta'
          : 'firstName, lastName y password son requeridos para activar la cuenta',
        ERROR_CODES.VALIDATION_ERROR,
      );
    }
    const passwordHash = await bcrypt.hash(dto.password, 10);

    const now = new Date();

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        // Doble claim protección: updateMany con status 'pending' (count 0 → rollback).
        const invitationUpdate = await tx.userInvitation.updateMany({
          where: { id: invitation.id, status: 'pending' },
          data: { status: 'used', usedAt: now },
        });
        if (invitationUpdate.count === 0) throw new InvitationUsedException();

        let user = existingUser;
        if (isNewUser) {
          user = await tx.user.create({
            data: {
              email,
              firstName: dto.firstName!,
              lastName: dto.lastName!,
              phone: dto.phone ?? null,
              status: 'active',
              // D-S2: la posesión del token de invitación acredita la
              // verificación del email.
              emailVerifiedAt: now,
              credential: { create: { passwordHash } },
            },
          });
        } else {
          user = await tx.user.update({
            where: { id: existingUser!.id },
            data: {
              firstName: dto.firstName!,
              lastName: dto.lastName!,
              phone: dto.phone ?? existingUser!.phone ?? null,
              status: 'active',
              // D-S2: la posesión del token de invitación acredita la
              // verificación del email (cuenta pending reactivada).
              emailVerifiedAt: now,
              credential: {
                upsert: {
                  create: { passwordHash },
                  update: { passwordHash },
                },
              },
            },
          });
        }

        // Asigna el rol de la invitación si no existiera ya (unique userId+roleId).
        const existingAssignment =
          await tx.systemRoleAssignment.findUnique({
            where: {
              userId_roleId: { userId: user.id, roleId: invitation.roleId },
            },
            select: { id: true },
          });
        if (!existingAssignment) {
          await tx.systemRoleAssignment.create({
            data: { userId: user.id, roleId: invitation.roleId },
          });
        }

        return user;
      });

      // Post-commit: los permisos del user cambiaron (nuevo rol asignado).
      this.permissionCache.invalidateUser(result.id);

      this.eventEmitter.emit(
        'user.claimed',
        new UserClaimedEvent(result.id, email, invitation.role.type),
      );

      if (isNewUser) {
        this.eventEmitter.emit(
          'auth.user.registered',
          new UserRegisteredEvent(result.id, email),
        );
      }

      return {
        user: {
          id: result.id,
          email: result.email,
          firstName: result.firstName,
          lastName: result.lastName,
          phone: result.phone,
          status: result.status,
        },
        role: {
          type: invitation.role.type,
          name: invitation.role.name,
        },
      };
    } catch (error) {
      if (
        isNewUser &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new CodedHttpException(
          409,
          'Ya existe una cuenta con este email',
          ERROR_CODES.CONFLICT,
        );
      }
      throw error;
    }
  }
}