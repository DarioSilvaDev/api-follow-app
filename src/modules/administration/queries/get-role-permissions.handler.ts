import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../common/database/prisma.service';

@Injectable()
export class GetRolePermissionsHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(roleId: string) {
    const role = await this.prisma.systemRole.findUnique({
      where: { id: roleId },
      include: {
        permissions: {
          include: { permission: true },
          orderBy: { permission: { code: 'asc' } },
        },
      },
    });

    if (!role) throw new NotFoundException('SystemRole', roleId);

    return role;
  }
}
