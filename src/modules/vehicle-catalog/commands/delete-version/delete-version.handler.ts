import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../../../common/database/prisma.service';
import { DeleteVersionCommand } from './delete-version.command';

@Injectable()
export class DeleteVersionHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: DeleteVersionCommand): Promise<void> {
    const { id } = command;

    const version = await this.prisma.vehicleVersion.findUnique({
      where: { id },
      include: { vehicles: { take: 1 } },
    });
    if (!version) {
      throw new NotFoundException('Version not found');
    }
    if (version.vehicles.length > 0) {
      throw new ConflictException(
        'Cannot delete version with linked vehicles. Remove or reassign vehicles first.',
      );
    }

    await this.prisma.vehicleVersion.delete({ where: { id } });
  }
}
