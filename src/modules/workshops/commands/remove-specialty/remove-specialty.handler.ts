import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../../common/database/prisma.service';
import { RemoveSpecialtyCommand } from './remove-specialty.command';

@Injectable()
export class RemoveSpecialtyHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: RemoveSpecialtyCommand) {
    const ws = await this.prisma.workshopSpecialty.findUnique({
      where: {
        workshopId_specialtyId: {
          workshopId: command.workshopId,
          specialtyId: command.specialtyId,
        },
      },
    });
    if (!ws) {
      throw new NotFoundException('Workshop specialty not found');
    }

    await this.prisma.workshopSpecialty.delete({
      where: { id: ws.id },
    });
  }
}
