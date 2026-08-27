import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../../common/database/prisma.service';
import { StorageR2Service } from '../../../../common/storage/storage-r2.service';
import { UploadDocumentCommand } from './upload-document.command';

@Injectable()
export class UploadDocumentHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageR2Service,
  ) {}

  async execute(command: UploadDocumentCommand) {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: command.vehicleId },
    });
    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }

    const { key } = await this.storage.upload(
      command.file,
      `vehicles/${command.vehicleId}/documents`,
    );

    return this.prisma.vehicleDocument.create({
      data: {
        vehicleId: command.vehicleId,
        key,
        name: command.dto.name,
        documentType: command.dto.documentType,
        expiresAt: command.dto.expiresAt
          ? new Date(command.dto.expiresAt)
          : null,
      },
    });
  }
}
