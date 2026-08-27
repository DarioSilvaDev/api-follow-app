import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../../common/database/prisma.service';
import { StorageR2Service } from '../../../../common/storage/storage-r2.service';
import { UploadPhotoCommand } from './upload-photo.command';

@Injectable()
export class UploadPhotoHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageR2Service,
  ) {}

  async execute(command: UploadPhotoCommand) {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: command.vehicleId },
    });
    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }

    const { key } = await this.storage.upload(
      command.file,
      `vehicles/${command.vehicleId}/photos`,
    );

    const existingCount = await this.prisma.vehiclePhoto.count({
      where: { vehicleId: command.vehicleId },
    });

    const photo = await this.prisma.vehiclePhoto.create({
      data: {
        vehicleId: command.vehicleId,
        key,
        isPrimary: existingCount === 0,
      },
    });

    return photo;
  }
}
