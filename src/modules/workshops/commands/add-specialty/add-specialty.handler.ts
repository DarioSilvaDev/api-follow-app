import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../../../common/database/prisma.service';
import { AddSpecialtyCommand } from './add-specialty.command';

@Injectable()
export class AddSpecialtyHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: AddSpecialtyCommand) {
    const specialty = await this.prisma.specialty.findUnique({
      where: { id: command.specialtyId },
    });
    if (!specialty) {
      throw new NotFoundException('Specialty not found');
    }

    const workshop = await this.prisma.workshop.findUnique({
      where: { id: command.workshopId },
    });
    if (!workshop) {
      throw new NotFoundException('Workshop not found');
    }

    const existing = await this.prisma.workshopSpecialty.findUnique({
      where: {
        workshopId_specialtyId: {
          workshopId: command.workshopId,
          specialtyId: command.specialtyId,
        },
      },
    });
    if (existing) {
      throw new ConflictException(
        'Specialty already assigned to this workshop',
      );
    }

    return this.prisma.workshopSpecialty.create({
      data: {
        workshopId: command.workshopId,
        specialtyId: command.specialtyId,
      },
      include: { specialty: true },
    });
  }
}
