import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../common/database/prisma.service';

@Injectable()
export class ListWorkshopSpecialtiesHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(workshopId: string) {
    return this.prisma.workshopSpecialty.findMany({
      where: { workshopId },
      include: { specialty: true },
      orderBy: { specialty: { name: 'asc' } },
    });
  }
}

@Injectable()
export class ListPublicSpecialtiesHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute() {
    return this.prisma.specialty.findMany({
      orderBy: { name: 'asc' },
    });
  }
}
