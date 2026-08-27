import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/database/prisma.service';
import { ModelResponseDto } from '../dto/model-response.dto';

@Injectable()
export class ListModelsHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(
    brandId?: string,
    includeInactive = false,
  ): Promise<ModelResponseDto[]> {
    const where: Record<string, unknown> = {};
    if (!includeInactive) where.isActive = true;
    if (brandId) where.brandId = brandId;

    const models = await this.prisma.vehicleModel.findMany({
      where,
      orderBy: { name: 'asc' },
    });
    return models.map((m) => ModelResponseDto.from(m));
  }
}
