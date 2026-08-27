import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../../common/database/prisma.service';
import { SetPrimaryPhotoCommand } from './set-primary-photo.command';

@Injectable()
export class SetPrimaryPhotoHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: SetPrimaryPhotoCommand) {
    const photo = await this.prisma.vehiclePhoto.findFirst({
      where: { id: command.photoId, vehicleId: command.vehicleId },
    });
    if (!photo) {
      throw new NotFoundException('Photo not found');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.vehiclePhoto.updateMany({
        where: { vehicleId: command.vehicleId, isPrimary: true },
        data: { isPrimary: false },
      });
      await tx.vehiclePhoto.update({
        where: { id: command.photoId },
        data: { isPrimary: true },
      });
    });

    return { ...photo, isPrimary: true };
  }
}
