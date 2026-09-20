import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/database/prisma.service';
import { CreateDealershipData, DealershipRepository } from './dealership.repository';
import { UpdateDealershipDto } from '../dto/update-dealership.dto';
import { DEFAULT_ROLES, ROLE_PERMISSIONS } from '../dealerships.constants';

@Injectable()
export class PrismaDealershipRepository implements DealershipRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateDealershipData) {
    const { ownerId, ...dealershipData } = data;

    const permissions = await this.prisma.permission.findMany({
      where: { code: { in: Object.values(ROLE_PERMISSIONS).flat() } },
    });

    const permissionMap = new Map(permissions.map((p) => [p.code, p.id]));

    const dealership = await this.prisma.dealership.create({
      data: {
        ...dealershipData,
        // D-103 / schema: el alta rápida crea la concesionaria OPERATIVA
        // (owner presente). `active` debe setearse explícitamente porque el
        // default del schema es `pending_claim` (onboarding admin).
        status: 'active',
        roles: {
          create: DEFAULT_ROLES.map((role) => ({
            code: role.code,
            name: role.name,
            isSystem: true,
            priority: role.priority,
            permissions: {
              create: (ROLE_PERMISSIONS[role.code] ?? [])
                .filter((code) => permissionMap.has(code))
                .map((code) => ({
                  permissionId: permissionMap.get(code)!,
                })),
            },
          })),
        },
      },
    });

    const ownerRole = await this.prisma.dealershipRole.findUnique({
      where: {
        dealershipId_code: { dealershipId: dealership.id, code: 'owner' },
      },
    });

    if (ownerRole) {
      await this.prisma.dealershipMember.create({
        data: {
          dealershipId: dealership.id,
          userId: ownerId,
          roleId: ownerRole.id,
          status: 'active',
          joinedAt: new Date(),
        },
      });
    }

    return this.prisma.dealership.findUniqueOrThrow({
      where: { id: dealership.id },
    });
  }

  async update(id: string, data: UpdateDealershipDto) {
    return this.prisma.dealership.update({ where: { id }, data });
  }

  async findById(id: string) {
    return this.prisma.dealership.findUnique({ where: { id } });
  }
}