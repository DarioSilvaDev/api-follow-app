import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../../common/database/prisma.service';
import { StorageR2Service } from '../../../../common/storage/storage-r2.service';
import { DeleteDocumentCommand } from './delete-document.command';

@Injectable()
export class DeleteDocumentHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageR2Service,
  ) {}

  async execute(command: DeleteDocumentCommand) {
    const doc = await this.prisma.vehicleDocument.findFirst({
      where: { id: command.documentId, vehicleId: command.vehicleId },
    });
    if (!doc) {
      throw new NotFoundException('Document not found');
    }

    await this.storage.delete(doc.key);
    await this.prisma.vehicleDocument.delete({
      where: { id: command.documentId },
    });
  }
}
