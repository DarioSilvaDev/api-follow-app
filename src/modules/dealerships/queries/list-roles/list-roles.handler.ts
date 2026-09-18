import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../common/database/prisma.service';

@Injectable()
export class ListRolesHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(dealershipId: string) {
    return this.prisma.dealershipRole.findMany({
      where: { dealershipId },
      include: { permissions: { include: { permission: true } } },
      orderBy: { priority: 'desc' },
    });
  }
}