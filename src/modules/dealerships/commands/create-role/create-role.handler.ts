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
    const dealership = await this.prisma.dealership.findUnique({
      where: { id: command.dealershipId },
    });
    if (!dealership)
      throw new NotFoundException('Dealership', command.dealershipId);

    const existing = await this.prisma.dealershipRole.findUnique({
      where: {
        dealershipId_code: {
          dealershipId: command.dealershipId,
          code: command.dto.code,
        },
      },
    });
    if (existing) {
      throw new ConflictException(
        `Role code '${command.dto.code}' already exists in this dealership`,
      );
    }

    const permissions = await this.prisma.permission.findMany({
      where: { code: { in: command.dto.permissionCodes } },
    });

    return this.prisma.dealershipRole.create({
      data: {
        dealershipId: command.dealershipId,
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