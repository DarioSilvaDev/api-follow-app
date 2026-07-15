import { Injectable } from '@nestjs/common';
import { NotFoundException } from '../../../../common/exceptions/not-found.exception';
import { PrismaService } from '../../../../common/database/prisma.service';

@Injectable()
export class GetMembersHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(workshopId: string) {
    const workshop = await this.prisma.workshop.findUnique({
      where: { id: workshopId },
    });
    if (!workshop) throw new NotFoundException('Workshop', workshopId);

    return this.prisma.workshopMember.findMany({
      where: { workshopId, status: { not: 'inactive' } },
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
