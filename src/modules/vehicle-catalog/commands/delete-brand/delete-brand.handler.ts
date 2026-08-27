import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../../../common/database/prisma.service';
import { DeleteBrandCommand } from './delete-brand.command';

@Injectable()
export class DeleteBrandHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: DeleteBrandCommand): Promise<void> {
    const { id } = command;

    const brand = await this.prisma.vehicleBrand.findUnique({
      where: { id },
      include: { models: { take: 1 } },
    });
    if (!brand) {
      throw new NotFoundException('Brand not found');
    }
    if (brand.models.length > 0) {
      throw new ConflictException(
        'Cannot delete brand with existing models. Remove or reassign models first.',
      );
    }

    await this.prisma.vehicleBrand.delete({ where: { id } });
  }
}
