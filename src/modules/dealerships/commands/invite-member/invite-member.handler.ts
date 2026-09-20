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
    const dealership = await this.prisma.dealership.findUnique({
      where: { id: command.dealershipId },
    });
    if (!dealership)
      throw new NotFoundException('Dealership', command.dealershipId);

    const token = uuid();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const invitation = await this.prisma.dealershipInvitation.create({
      data: {
        dealershipId: command.dealershipId,
        roleId: command.dto.roleId,
        invitedById: command.invitedById,
        email: command.dto.email,
        token,
        expiresAt,
        status: 'pending',
      },
    });

    this.eventEmitter.emit(
      'dealership.member.invited',
      new MemberInvitedEvent(
        command.dealershipId,
        command.dto.email,
        token,
        dealership.name,
      ),
    );

    return invitation;
  }
}