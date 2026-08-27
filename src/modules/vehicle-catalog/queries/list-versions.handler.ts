import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/database/prisma.service';
import { VersionResponseDto } from '../dto/version-response.dto';

@Injectable()
export class ListVersionsHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(modelId?: string): Promise<VersionResponseDto[]> {
    const where: Record<string, unknown> = {};
    if (modelId) where.modelId = modelId;

    const versions = await this.prisma.vehicleVersion.findMany({
      where,
      orderBy: { name: 'asc' },
    });
    return versions.map((v) => VersionResponseDto.from(v));
  }
}
