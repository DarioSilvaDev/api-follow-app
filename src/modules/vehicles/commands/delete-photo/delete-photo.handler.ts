import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../../common/database/prisma.service';
import { StorageR2Service } from '../../../../common/storage/storage-r2.service';
import { DeletePhotoCommand } from './delete-photo.command';

@Injectable()
export class DeletePhotoHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageR2Service,
  ) {}

  async execute(command: DeletePhotoCommand) {
    const photo = await this.prisma.vehiclePhoto.findFirst({
      where: { id: command.photoId, vehicleId: command.vehicleId },
    });
    if (!photo) {
      throw new NotFoundException('Photo not found');
    }

    await this.storage.delete(photo.key);

    await this.prisma.$transaction(async (tx) => {
      await tx.vehiclePhoto.delete({ where: { id: command.photoId } });

      if (photo.isPrimary) {
        const latest = await tx.vehiclePhoto.findFirst({
          where: { vehicleId: command.vehicleId },
          orderBy: { createdAt: 'desc' },
        });
        if (latest) {
          await tx.vehiclePhoto.update({
            where: { id: latest.id },
            data: { isPrimary: true },
          });
        }
      }
    });
  }
}
