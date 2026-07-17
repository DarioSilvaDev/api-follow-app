import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/database/prisma.service';

@Injectable()
export class ListUsersHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute() {
    return this.prisma.user.findMany({
      include: {
        systemRoleAssignments: {
          include: { role: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
