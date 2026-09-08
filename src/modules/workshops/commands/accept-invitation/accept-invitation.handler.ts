import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
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
    const invitation = await this.prisma.workshopInvitation.findUnique({
      where: { token: command.token },
    });

    if (
      !invitation ||
      invitation.status !== 'pending' ||
      invitation.expiresAt < new Date()
    ) {
      throw new UnauthorizedException('Invalid or expired invitation');
    }

    // Security Review #5 (P1): the invitation is bound to a specific email.
    // The authenticated user may only accept an invitation addressed to their
    // own email. A mismatch is a permission error (403 PERMISSION_DENIED, D-025).
    if (
      command.email &&
      invitation.email.toLowerCase() !== command.email.toLowerCase()
    ) {
      throw new ForbiddenException(
        'This invitation is not addressed to your account',
      );
    }

    const member = await this.prisma.workshopMember.create({
      data: {
        workshopId: invitation.workshopId,
        userId: command.userId,
        roleId: invitation.roleId,
        status: 'active',
        joinedAt: new Date(),
      },
    });

    await this.prisma.workshopInvitation.update({
      where: { id: invitation.id },
      data: { status: 'accepted', acceptedAt: new Date() },
    });

    this.eventEmitter.emit(
      'workshop.member.joined',
      new MemberJoinedEvent(invitation.workshopId, command.userId),
    );

    this.permissionCache.invalidateUser(command.userId);

    return member;
  }
}
