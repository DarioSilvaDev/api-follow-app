import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../../common/database/prisma.service';

@Injectable()
export class GetDocumentHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(vehicleId: string, documentId: string) {
    const doc = await this.prisma.vehicleDocument.findFirst({
      where: { id: documentId, vehicleId },
    });
    if (!doc) {
      throw new NotFoundException('Document not found');
    }
    return doc;
  }
}
