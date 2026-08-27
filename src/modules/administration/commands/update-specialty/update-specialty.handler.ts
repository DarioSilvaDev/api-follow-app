import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../../../common/database/prisma.service';
import { UpdateSpecialtyCommand } from './update-specialty.command';

@Injectable()
export class UpdateSpecialtyHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: UpdateSpecialtyCommand) {
    const specialty = await this.prisma.specialty.findUnique({
      where: { id: command.id },
    });
    if (!specialty) {
      throw new NotFoundException('Specialty not found');
    }

    if (command.dto.code) {
      const existing = await this.prisma.specialty.findUnique({
        where: { code: command.dto.code },
      });
      if (existing && existing.id !== command.id) {
        throw new ConflictException(
          `Specialty code '${command.dto.code}' already exists`,
        );
      }
    }

    return this.prisma.specialty.update({
      where: { id: command.id },
      data: command.dto,
    });
  }
}
