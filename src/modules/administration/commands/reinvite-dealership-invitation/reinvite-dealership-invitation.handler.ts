import { Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { v4 as uuid } from 'uuid';
import {
  CodedHttpException,
  InvitationUsedException,
} from '../../../../common/exceptions/coded.exception';
import { ERROR_CODES } from '../../../../common/exceptions/error-codes';
import { PrismaService } from '../../../../common/database/prisma.service';
import { MemberInvitedEvent } from '../../../dealerships/events/member-invited.event';
import { ReinviteDealershipInvitationCommand } from './reinvite-dealership-invitation.command';

/**
 * D-106: reenvío de invitación del onboarding admin (solo `pending_claim`).
 *
 * Semántica del contrato frontend congelado (admin-errors.ts):
 * - dealership inexistente → 404;
 * - dealership ya reclamada → 409 INVITATION_USED ("ya no está vigente");
 * - invitación pending VIGENTE → 409 CONFLICT ("sigue vigente", NO se reenvía);
 * - sin invitación vigente → cancela pendientes vencidas (si las hay) y crea
 *   una nueva (token fresco, vigencia 7 días); el token va solo por email.
 */
@Injectable()
export class ReinviteDealershipInvitationHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async execute(command: ReinviteDealershipInvitationCommand) {
    const dealership = await this.prisma.dealership.findUnique({
      where: { id: command.dealershipId },
    });
    if (!dealership) {
      throw new NotFoundException('Dealership', command.dealershipId);
    }

    if (dealership.status !== 'pending_claim') {
      // El claim ya completó el onboarding (invitación original usada).
      throw new InvitationUsedException();
    }

    if (!dealership.email) {
      throw new CodedHttpException(
        409,
        'La concesionaria no tiene email de invitación asociado',
        ERROR_CODES.CONFLICT,
      );
    }

    const ownerEmail = dealership.email;
    const now = new Date();

    const latestPending = await this.prisma.dealershipInvitation.findFirst({
      where: {
        dealershipId: dealership.id,
        email: ownerEmail,
        status: 'pending',
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true, expiresAt: true },
    });

    if (latestPending && latestPending.expiresAt > now) {
      throw new CodedHttpException(
        409,
        'La invitación actual sigue vigente',
        ERROR_CODES.CONFLICT,
      );
    }

    const token = uuid();
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const invitation = await this.prisma.$transaction(async (tx) => {
      // Solo las pendientes vencidas se cancelan (las vigentes nunca llegan acá).
      await tx.dealershipInvitation.updateMany({
        where: {
          dealershipId: dealership.id,
          email: ownerEmail,
          status: 'pending',
          expiresAt: { lte: now },
        },
        data: { status: 'cancelled' },
      });

      const ownerRole = await tx.dealershipRole.findUnique({
        where: {
          dealershipId_code: { dealershipId: dealership.id, code: 'owner' },
        },
      });
      if (!ownerRole) {
        throw new Error(`Owner role missing for dealership ${dealership.id}`);
      }

      return tx.dealershipInvitation.create({
        data: {
          dealershipId: dealership.id,
          roleId: ownerRole.id,
          invitedById: command.invitedById,
          email: ownerEmail,
          token,
          expiresAt,
          status: 'pending',
        },
      });
    });

    this.eventEmitter.emit(
      'dealership.member.invited',
      new MemberInvitedEvent(dealership.id, ownerEmail, token, dealership.name),
    );

    return {
      invitation: {
        id: invitation.id,
        email: invitation.email,
        expiresAt: invitation.expiresAt,
        status: invitation.status,
      },
    };
  }
}
