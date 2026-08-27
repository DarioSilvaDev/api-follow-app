import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../common/database/prisma.service';

@Injectable()
export class ListRolesHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(workshopId: string) {
    return this.prisma.workshopRole.findMany({
      where: { workshopId },
      include: { permissions: { include: { permission: true } } },
      orderBy: { priority: 'desc' },
    });
  }
}
