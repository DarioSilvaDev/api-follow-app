import { Injectable } from '@nestjs/common';
import { NotFoundException } from '../../../../common/exceptions/not-found.exception';
import { PrismaService } from '../../../../common/database/prisma.service';

@Injectable()
export class GetWorkshopHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(id: string) {
    const workshop = await this.prisma.workshop.findUnique({
      where: { id },
      include: {
        branches: {
          where: { isActive: true },
          orderBy: { isHeadquarters: 'desc' },
        },
        _count: { select: { members: true, branches: true } },
      },
    });

    if (!workshop) throw new NotFoundException('Workshop', id);
    return workshop;
  }
}
