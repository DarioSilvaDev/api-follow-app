import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../../../common/database/prisma.service';
import { PermissionCache } from '../../../../common/cache/permission-cache';
import { MemberJoinedEvent } from '../../events/member-joined.event';
import { AcceptInvitationCommand } from './accept-invitation.command';

@Injectable()
export class AcceptInvitationHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    private readonly permissionCache: PermissionCache,
  ) {}

  async execute(command: AcceptInvitationCommand) {
    const invitation = await this.prisma.dealershipInvitation.findUnique({
      where: { token: command.token },
    });

    if (
      !invitation ||
      invitation.status !== 'pending' ||
      invitation.expiresAt < new Date()
    ) {
      throw new UnauthorizedException('Invalid or expired invitation');
    }

    // Security Review #5 (P1): la invitación está vinculada a un email.
    // El usuario autenticado solo puede aceptar invitaciones dirigidas a su
    // propia cuenta. Un mismatch es un error de permisos (403 PERMISSION_DENIED).
    if (
      command.email &&
      invitation.email.toLowerCase() !== command.email.toLowerCase()
    ) {
      throw new ForbiddenException(
        'This invitation is not addressed to your account',
      );
    }

    // Espesor: un usuario ya miembro activo no puede "aceptar" otra vez
    // (el unique [dealershipId, userId] no impide doble aceptación de
    // invitaciones distintas; el conflict se detecta aquí).
    const alreadyMember = await this.prisma.dealershipMember.findUnique({
      where: {
        dealershipId_userId: {
          dealershipId: invitation.dealershipId,
          userId: command.userId,
        },
      },
    });
    if (alreadyMember && alreadyMember.status === 'active') {
      throw new ConflictException(
        'You are already an active member of this dealership',
      );
    }

    const member = await this.prisma.dealershipMember.create({
      data: {
        dealershipId: invitation.dealershipId,
        userId: command.userId,
        roleId: invitation.roleId,
        status: 'active',
        joinedAt: new Date(),
      },
    });

    await this.prisma.dealershipInvitation.update({
      where: { id: invitation.id },
      data: { status: 'accepted', acceptedAt: new Date() },
    });

    this.eventEmitter.emit(
      'dealership.member.joined',
      new MemberJoinedEvent(invitation.dealershipId, command.userId),
    );

    this.permissionCache.invalidateUser(command.userId);

    return member;
  }
}