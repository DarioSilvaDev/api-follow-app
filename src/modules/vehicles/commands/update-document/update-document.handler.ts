import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../../common/database/prisma.service';
import { UpdateDocumentCommand } from './update-document.command';

@Injectable()
export class UpdateDocumentHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: UpdateDocumentCommand) {
    const doc = await this.prisma.vehicleDocument.findFirst({
      where: { id: command.documentId, vehicleId: command.vehicleId },
    });
    if (!doc) {
      throw new NotFoundException('Document not found');
    }

    return this.prisma.vehicleDocument.update({
      where: { id: command.documentId },
      data: {
        ...(command.dto.name !== undefined && { name: command.dto.name }),
        ...(command.dto.documentType !== undefined && {
          documentType: command.dto.documentType,
        }),
        ...(command.dto.expiresAt !== undefined && {
          expiresAt: new Date(command.dto.expiresAt),
        }),
      },
    });
  }
}
