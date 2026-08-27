import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/database/prisma.service';
import { RoleDto } from '../dto/role.dto';

@Injectable()
export class RoleService {
  constructor(private readonly prisma: PrismaService) {}

  async loadUserRoles(
    userId: string,
    includePermissions = false,
  ): Promise<RoleDto[]> {
    const assignments = await this.prisma.systemRoleAssignment.findMany({
      where: { userId },
      include: {
        role: includePermissions
          ? { include: { permissions: { include: { permission: true } } } }
          : true,
      },
    });

    assignments.sort((a, b) => b.role.priority - a.role.priority);

    return assignments.map((a) => RoleDto.from(a, includePermissions));
  }
}
