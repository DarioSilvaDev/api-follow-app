import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../common/database/prisma.service';

@Injectable()
export class GetWorkshopHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(workshopId: string) {
    const workshop = await this.prisma.workshop.findUnique({
      where: { id: workshopId },
      include: {
        branches: true,
        members: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
            role: {
              select: { id: true, code: true, name: true },
            },
          },
        },
      },
    });

    if (!workshop) throw new NotFoundException('Workshop', workshopId);

    return workshop;
  }
}
