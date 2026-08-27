import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../common/database/prisma.service';

@Injectable()
export class GetUserHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        systemRoleAssignments: {
          include: { role: true },
        },
      },
    });

    if (!user) throw new NotFoundException('User', userId);

    return user;
  }
}
