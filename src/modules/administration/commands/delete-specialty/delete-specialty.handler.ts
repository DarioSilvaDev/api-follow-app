import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../../common/database/prisma.service';
import { DeleteSpecialtyCommand } from './delete-specialty.command';

@Injectable()
export class DeleteSpecialtyHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: DeleteSpecialtyCommand) {
    const specialty = await this.prisma.specialty.findUnique({
      where: { id: command.id },
    });
    if (!specialty) {
      throw new NotFoundException('Specialty not found');
    }

    await this.prisma.specialty.delete({ where: { id: command.id } });
  }
}
