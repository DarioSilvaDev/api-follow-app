import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/database/prisma.service';
import { CreateDealershipData, DealershipRepository } from './dealership.repository';
import { UpdateDealershipDto } from '../dto/update-dealership.dto';

/**
 * Roles por defecto de una concesionaria (RB-10, seed): owner/admin/seller.
 *
 * A diferencia de workshops (donde el repository y el seed usan códigos
 * divergentes), aquí los códigos SIEMPRE deben coincidir con la matriz del
 * seed `systemDealershipRolePermissions` (owner 100 > admin 60 > seller 40)
 * porque las concesionarias demo se siembran con esos mismos roles.
 */
const DEFAULT_ROLES = [
  { code: 'owner', name: 'Owner', priority: 100 },
  { code: 'admin', name: 'Admin', priority: 60 },
  { code: 'seller', name: 'Seller', priority: 40 },
];

// RB-10: matriz de permisos de la cadena de consignación (resolución PM §8).
// `dealership.create` se excluye deliberadamente: es un permiso a nivel
// platform que NO se asigna a roles de concesionaria (comentario L641-642
// del seed). El alta rápida (D-103) se cubre con POST /dealerships autenticado.
const ROLE_PERMISSIONS: Record<string, string[]> = {
  owner: [
    'dealership.update',
    'dealership.members.invite',
    'dealership.members.role.update',
    'dealership.members.remove',
    'dealership.vehicle.take',
    'dealership.vehicle.sell',
    'dealership.vehicle.return',
    'care-episode.create',
    'history.view',
  ],
  admin: [
    'dealership.update',
    'dealership.members.invite',
    'dealership.vehicle.take',
    'care-episode.create',
    'history.view',
  ],
  seller: [
    'dealership.vehicle.sell',
    'dealership.vehicle.return',
    'care-episode.create',
    'history.view',
  ],
};

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