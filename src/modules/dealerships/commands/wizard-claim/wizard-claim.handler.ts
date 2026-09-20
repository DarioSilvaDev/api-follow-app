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
  PermissionDeniedException,
  AuthRequiredException,
} from '../../../../common/exceptions/coded.exception';
import { PrismaService } from '../../../../common/database/prisma.service';
import { PermissionCache } from '../../../../common/cache/permission-cache';
import { MemberJoinedEvent } from '../../events/member-joined.event';
import { DealershipClaimedEvent } from '../../events/dealership-claimed.event';
import { UserRegisteredEvent } from '../../../auth/events/user-registered.event';
import { WizardClaimCommand } from './wizard-claim.command';

/**
 * D-106: claim del wizard de onboarding de concesionaria.
 *
 * Flujo (transaccional):
 * 1. Valida token/invitación (404 inválida, 400 expirada, 409 usada/cancelada).
 * 2. Valida que la concesionaria siga `pending_claim`.
 * 3. Valida que el email del body matchee la invitación (403 PERMISSION_DENIED).
 * 4. Según el estado de la cuenta del dueño:
 *    - soft-deleted (deletedAt) → 409 CONFLICT explícito (D-S3), ni purge ni
 *      restore en v1;
 *    - inexistente → crea cuenta active + credential (exige firstName/lastName/password);
 *    - pending → reactiva la cuenta y fija la credencial (exige el mismo set
 *      de datos; la invitación admin autoriza el alta, el login de auth
 *      rechaza cuentas pending — 401 INVALID_CREDENTIALS);
 *    - active → exige sesión (401 AUTH_REQUIRED) y que la sesión sea del dueño
 *      del email (403 PERMISSION_DENIED si no).
 * 5. Acepta la invitación, marca la dealership active + claimed_at y crea el
 *    membership owner.
 *
 * Eventos posteriores al commit: dealership.member.joined, dealership.claimed
 * y (solo cuenta nueva) auth.user.registered.
 */
@Injectable()
export class WizardClaimHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    private readonly permissionCache: PermissionCache,
  ) {}

  async execute(command: WizardClaimCommand) {
    const dto = command.dto;
    const email = dto.email.trim().toLowerCase();

    const invitation = await this.prisma.dealershipInvitation.findUnique({
      where: { token: dto.token },
      include: {
        dealership: { select: { id: true, name: true, status: true } },
      },
    });

    if (!invitation) throw new InvitationInvalidException();
    if (invitation.status === 'accepted') throw new InvitationUsedException();
    if (invitation.status === 'cancelled') {
      throw new InvitationCancelledException();
    }
    if (invitation.expiresAt < new Date())
      throw new InvitationExpiredException();
    if (invitation.dealership.status !== 'pending_claim') {
      throw new InvitationUsedException();
    }

    if (email !== invitation.email.toLowerCase()) {
      throw new PermissionDeniedException(
        'The email does not match the invitation',
      );
    }

    // Cuenta del dueño: case-insensitive. Se trae también la soft-deleted
    // (sin filtro deletedAt) para distinguir "email libre" de "email de cuenta
    // desactivada": el unique de users.email garantiza a lo sumo un registro
    // por email, así que findFirst devuelve el usuario (vivo o borrado).
    const existingUser = await this.prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
    });

    // D-S3: cuenta soft-deleted con ese email → bloqueo 409 explícito en v1
    // (ni purga ni restore). Mensaje claro para el usuario, sin detalle
    // técnico. Reemplaza el P2002 genérico del unique constraint que antes se
    // disparaba al intentar crear la cuenta con el mismo email.
    if (existingUser?.deletedAt) {
      throw new CodedHttpException(
        409,
        'Este email está asociado a una cuenta desactivada. Contactá a soporte.',
        ERROR_CODES.CONFLICT,
      );
    }

    let isNewUser = false;
    let userId: string;
    let passwordHash: string | undefined;

    if (!existingUser) {
      isNewUser = true;
      if (!dto.firstName || !dto.lastName || !dto.password) {
        throw new CodedHttpException(
          400,
          'firstName, lastName y password son requeridos para crear la cuenta',
          ERROR_CODES.VALIDATION_ERROR,
        );
      }
      passwordHash = await bcrypt.hash(dto.password, 10);
      userId = '';
    } else if (existingUser.status === 'suspended') {
      throw new PermissionDeniedException('The account is suspended');
    } else if (existingUser.status === 'active') {
      if (!command.sessionUserId) {
        throw new AuthRequiredException(
          'Debes iniciar sesión para vincular tu cuenta a la concesionaria',
        );
      }
      if (command.sessionUserId !== existingUser.id) {
        throw new PermissionDeniedException(
          'La invitación pertenece a otra cuenta',
        );
      }
      userId = existingUser.id;
    } else {
      // pending → no tiene credencial usable (login de auth la rechaza). La
      // invitación admin autoriza reactivar la cuenta y fijar la credencial:
      // se exige el mismo set de datos que el registro.
      if (!dto.firstName || !dto.lastName || !dto.password) {
        throw new CodedHttpException(
          400,
          'firstName, lastName y password son requeridos para activar la cuenta',
          ERROR_CODES.VALIDATION_ERROR,
        );
      }
      passwordHash = await bcrypt.hash(dto.password, 10);
      userId = existingUser.id;
    }

    const now = new Date();
    const dealershipPatch: Record<string, unknown> = {
      status: 'active',
      claimedAt: now,
    };
    if (dto.dealership) {
      if (dto.dealership.email) dealershipPatch.email = dto.dealership.email;
      if (dto.dealership.phone !== undefined) {
        dealershipPatch.phone = dto.dealership.phone;
      }
      if (dto.dealership.website !== undefined) {
        dealershipPatch.website = dto.dealership.website;
      }
      if (dto.dealership.description !== undefined) {
        dealershipPatch.description = dto.dealership.description;
      }
    }

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        // Doble claim protección: updateMany con status 'pending' (count 0 → rollback).
        const invitationUpdate = await tx.dealershipInvitation.updateMany({
          where: { id: invitation.id, status: 'pending' },
          data: { status: 'accepted', acceptedAt: now },
        });
        if (invitationUpdate.count === 0) throw new InvitationUsedException();

        const dealershipUpdate = await tx.dealership.updateMany({
          where: { id: invitation.dealershipId, status: 'pending_claim' },
          data: dealershipPatch,
        });
        if (dealershipUpdate.count === 0) throw new InvitationUsedException();

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
              // verificación del email (cuenta nueva del wizard).
              emailVerifiedAt: now,
              credential: { create: { passwordHash: passwordHash! } },
            },
          });
          userId = user.id;
        } else if (existingUser!.status === 'pending') {
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
              // upsert: una cuenta pending podría no tener credential.
              credential: {
                upsert: {
                  create: { passwordHash: passwordHash! },
                  update: { passwordHash: passwordHash! },
                },
              },
            },
          });
          userId = user.id;
        }

        const ownerRole = await tx.dealershipRole.findUnique({
          where: {
            dealershipId_code: {
              dealershipId: invitation.dealershipId,
              code: 'owner',
            },
          },
          select: { id: true },
        });
        if (!ownerRole) {
          throw new Error(
            `Owner role missing for dealership ${invitation.dealershipId}`,
          );
        }

        const member = await tx.dealershipMember.create({
          data: {
            dealershipId: invitation.dealershipId,
            userId: userId!,
            roleId: ownerRole.id,
            status: 'active',
            joinedAt: now,
            invitedAt: invitation.createdAt,
            acceptedAt: now,
          },
          include: { role: { select: { code: true } } },
        });

        const dealership = await tx.dealership.findUniqueOrThrow({
          where: { id: invitation.dealershipId },
        });

        return { user: user!, member, dealership };
      });

      // Post-commit: los permisos del user cambiaron (nuevo membership owner).
      this.permissionCache.invalidateUser(userId!);

      this.eventEmitter.emit(
        'dealership.member.joined',
        new MemberJoinedEvent(invitation.dealershipId, userId!),
      );

      this.eventEmitter.emit(
        'dealership.claimed',
        new DealershipClaimedEvent(invitation.dealershipId, userId!, email),
      );

      if (isNewUser) {
        this.eventEmitter.emit(
          'auth.user.registered',
          new UserRegisteredEvent(userId!, email),
        );
      }

      return {
        user: {
          id: result.user.id,
          email: result.user.email,
          firstName: result.user.firstName,
          lastName: result.user.lastName,
          phone: result.user.phone,
          status: result.user.status,
        },
        dealership: {
          id: result.dealership.id,
          name: result.dealership.name,
          status: result.dealership.status,
          email: result.dealership.email,
          phone: result.dealership.phone,
          website: result.dealership.website,
          description: result.dealership.description,
        },
        member: {
          id: result.member.id,
          role: result.member.role ?? { code: 'owner' },
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
