import { Injectable } from '@nestjs/common';
import { NotFoundException } from '../../../../common/exceptions/not-found.exception';
import { PrismaService } from '../../../../common/database/prisma.service';

@Injectable()
export class GetInvitationsHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(dealershipId: string) {
    const dealership = await this.prisma.dealership.findUnique({
      where: { id: dealershipId },
    });
    if (!dealership) throw new NotFoundException('Dealership', dealershipId);

    return this.prisma.dealershipInvitation.findMany({
      where: { dealershipId },
      include: {
        role: { select: { id: true, code: true, name: true } },
        invitedBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}