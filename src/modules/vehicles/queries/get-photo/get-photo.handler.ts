import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../../common/database/prisma.service';

@Injectable()
export class GetPhotoHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(vehicleId: string, photoId: string) {
    const photo = await this.prisma.vehiclePhoto.findFirst({
      where: { id: photoId, vehicleId },
    });
    if (!photo) {
      throw new NotFoundException('Photo not found');
    }
    return photo;
  }
}
