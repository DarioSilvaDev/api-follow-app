import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../common/database/prisma.service';

@Injectable()
export class ListAdminSpecialtiesHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute() {
    return this.prisma.specialty.findMany({
      orderBy: { name: 'asc' },
    });
  }
}
