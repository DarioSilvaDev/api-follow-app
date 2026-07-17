import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/database/prisma.service';
import { CreateWorkshopData, WorkshopRepository } from './workshop.repository';
import { UpdateWorkshopDto } from '../dto/update-workshop.dto';

const DEFAULT_ROLES = [
  { code: 'admin', name: 'Admin', priority: 100 },
  { code: 'mechanic', name: 'Mechanic', priority: 50 },
  { code: 'receptionist', name: 'Receptionist', priority: 30 },
  { code: 'viewer', name: 'Viewer', priority: 10 },
];

const ROLE_PERMISSIONS: Record<string, string[]> = {
  admin: [
    'vehicle.read',
    'vehicle.update',
    'vehicle.transfer',
    'vehicle.documents.read',
    'vehicle.documents.write',
    'vehicle.history.read',
    'vehicle.history.write',
    'vehicle.photos.read',
    'vehicle.photos.write',
    'vehicle.share.create',
    'vehicle.share.revoke',
    'workshop.update',
    'workshop.branch.create',
    'workshop.hours.set',
    'member.invite',
    'member.role.update',
    'member.remove',
    'appointment.create',
    'appointment.update',
    'appointment.cancel',
    'estimate.create',
    'estimate.approve',
    'workorder.create',
    'workorder.close',
    'history.view',
    'history.share',
    'subscription.manage',
  ],
  mechanic: [
    'vehicle.read',
    'vehicle.update',
    'vehicle.documents.read',
    'vehicle.documents.write',
    'vehicle.history.read',
    'vehicle.history.write',
    'vehicle.photos.read',
    'appointment.create',
    'appointment.update',
    'appointment.cancel',
    'workorder.create',
    'workorder.close',
    'history.view',
  ],
  receptionist: [
    'vehicle.read',
    'vehicle.history.read',
    'vehicle.photos.read',
    'appointment.create',
    'appointment.update',
    'appointment.cancel',
    'estimate.create',
    'history.view',
    'history.share',
  ],
  viewer: ['vehicle.read', 'vehicle.history.read', 'history.view'],
};

@Injectable()
export class PrismaWorkshopRepository implements WorkshopRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateWorkshopData) {
    const { ownerId, ...workshopData } = data;

    const permissions = await this.prisma.permission.findMany({
      where: { code: { in: Object.values(ROLE_PERMISSIONS).flat() } },
    });

    const permissionMap = new Map(permissions.map((p) => [p.code, p.id]));

    const workshop = await this.prisma.workshop.create({
      data: {
        ...workshopData,
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

    const adminRole = await this.prisma.workshopRole.findUnique({
      where: { workshopId_code: { workshopId: workshop.id, code: 'admin' } },
    });

    if (adminRole) {
      await this.prisma.workshopMember.create({
        data: {
          workshopId: workshop.id,
          userId: ownerId,
          roleId: adminRole.id,
          status: 'active',
          joinedAt: new Date(),
        },
      });
    }

    return this.prisma.workshop.findUniqueOrThrow({
      where: { id: workshop.id },
    });
  }

  async update(id: string, data: UpdateWorkshopDto) {
    return this.prisma.workshop.update({ where: { id }, data });
  }

  async findById(id: string) {
    return this.prisma.workshop.findUnique({ where: { id } });
  }
}
