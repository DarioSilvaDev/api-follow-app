import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../../common/database/prisma.service';
import { CreateRoleCommand } from './create-role.command';

@Injectable()
export class CreateRoleHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: CreateRoleCommand) {
    const existing = await this.prisma.workshopRole.findUnique({
      where: {
        workshopId_code: {
          workshopId: command.workshopId,
          code: command.dto.code,
        },
      },
    });
    if (existing) {
      throw new ConflictException(
        `Role code '${command.dto.code}' already exists in this workshop`,
      );
    }

    const permissions = await this.prisma.permission.findMany({
      where: { code: { in: command.dto.permissionCodes } },
    });

    return this.prisma.workshopRole.create({
      data: {
        workshopId: command.workshopId,
        code: command.dto.code,
        name: command.dto.name,
        description: command.dto.description,
        priority: command.dto.priority ?? 0,
        isSystem: false,
        permissions: {
          create: permissions.map((p) => ({
            permissionId: p.id,
          })),
        },
      },
      include: { permissions: { include: { permission: true } } },
    });
  }
}
