import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../../../common/database/prisma.service';
import { DeleteModelCommand } from './delete-model.command';

@Injectable()
export class DeleteModelHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: DeleteModelCommand): Promise<void> {
    const { id } = command;

    const model = await this.prisma.vehicleModel.findUnique({
      where: { id },
      include: { versions: { take: 1 } },
    });
    if (!model) {
      throw new NotFoundException('Model not found');
    }
    if (model.versions.length > 0) {
      throw new ConflictException(
        'Cannot delete model with existing versions. Remove or reassign versions first.',
      );
    }

    await this.prisma.vehicleModel.delete({ where: { id } });
  }
}
