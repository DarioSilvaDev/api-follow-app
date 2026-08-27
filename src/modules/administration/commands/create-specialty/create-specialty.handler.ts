import { Injectable, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../../../common/database/prisma.service';
import { CreateSpecialtyCommand } from './create-specialty.command';

@Injectable()
export class CreateSpecialtyHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: CreateSpecialtyCommand) {
    const existing = await this.prisma.specialty.findUnique({
      where: { code: command.dto.code },
    });
    if (existing) {
      throw new ConflictException(
        `Specialty code '${command.dto.code}' already exists`,
      );
    }

    return this.prisma.specialty.create({ data: command.dto });
  }
}
