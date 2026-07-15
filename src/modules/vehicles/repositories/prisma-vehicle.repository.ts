import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/database/prisma.service';
import { RegisterVehicleDto } from '../dto/register-vehicle.dto';
import { UpdateVehicleDto } from '../dto/update-vehicle.dto';
import { RegisterVehicleData, VehicleRepository } from './vehicle.repository';

@Injectable()
export class PrismaVehicleRepository implements VehicleRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: RegisterVehicleData) {
    const { ownerId, ...vehicleData } = data;

    return this.prisma.vehicle.create({
      data: {
        ...vehicleData,
        ownerships: {
          create: {
            userId: ownerId,
            type: 'owner',
            startsAt: new Date(),
          },
        },
      },
    });
  }

  async update(id: string, data: UpdateVehicleDto) {
    return this.prisma.vehicle.update({ where: { id }, data });
  }

  async delete(id: string) {
    await this.prisma.vehicle.delete({ where: { id } });
  }

  async findById(id: string) {
    return this.prisma.vehicle.findUnique({ where: { id } });
  }

  async findByLicensePlate(plate: string) {
    return this.prisma.vehicle.findUnique({ where: { licensePlate: plate } });
  }
}
