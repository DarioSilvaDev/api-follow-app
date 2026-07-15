import { Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { v4 as uuid } from 'uuid';
import { PrismaService } from '../../../../common/database/prisma.service';
import { MemberInvitedEvent } from '../../events/member-invited.event';
import { InviteMemberCommand } from './invite-member.command';

@Injectable()
export class InviteMemberHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async execute(command: InviteMemberCommand) {
    const workshop = await this.prisma.workshop.findUnique({
      where: { id: command.workshopId },
    });
    if (!workshop) throw new NotFoundException('Workshop', command.workshopId);

    const token = uuid();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const invitation = await this.prisma.workshopInvitation.create({
      data: {
        workshopId: command.workshopId,
        roleId: command.dto.roleId,
        invitedById: command.invitedById,
        email: command.dto.email,
        token,
        expiresAt,
        status: 'pending',
      },
    });

    this.eventEmitter.emit(
      'workshop.member.invited',
      new MemberInvitedEvent(command.workshopId, command.dto.email, token),
    );

    return invitation;
  }
}
