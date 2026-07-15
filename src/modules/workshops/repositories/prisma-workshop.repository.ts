import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/database/prisma.service';
import { CreateWorkshopData, WorkshopRepository } from './workshop.repository';
import { UpdateWorkshopDto } from '../dto/update-workshop.dto';

@Injectable()
export class PrismaWorkshopRepository implements WorkshopRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateWorkshopData) {
    const { ownerId, ...workshopData } = data;

    const workshop = await this.prisma.workshop.create({
      data: {
        ...workshopData,
        roles: {
          create: {
            code: 'admin',
            name: 'Admin',
            isSystem: true,
            priority: 100,
          },
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
