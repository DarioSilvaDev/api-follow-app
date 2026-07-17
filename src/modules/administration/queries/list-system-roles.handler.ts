import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/database/prisma.service';

@Injectable()
export class ListSystemRolesHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute() {
    return this.prisma.systemRole.findMany({
      orderBy: { priority: 'desc' },
    });
  }
}
