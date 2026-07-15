import { Injectable, UnauthorizedException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../../../common/database/prisma.service';
import { MemberJoinedEvent } from '../../events/member-joined.event';
import { AcceptInvitationCommand } from './accept-invitation.command';

@Injectable()
export class AcceptInvitationHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
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

    return member;
  }
}
