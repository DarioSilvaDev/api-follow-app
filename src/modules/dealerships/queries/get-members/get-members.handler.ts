import { Injectable } from '@nestjs/common';
import { NotFoundException } from '../../../../common/exceptions/not-found.exception';
import { PrismaService } from '../../../../common/database/prisma.service';

@Injectable()
export class GetMembersHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(dealershipId: string) {
    const dealership = await this.prisma.dealership.findUnique({
      where: { id: dealershipId },
    });
    if (!dealership) throw new NotFoundException('Dealership', dealershipId);

    return this.prisma.dealershipMember.findMany({
      where: { dealershipId, status: { not: 'inactive' } },
      include: {
        user: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        role: { select: { id: true, code: true, name: true } },
      },
      orderBy: { joinedAt: 'asc' },
    });
  }
}