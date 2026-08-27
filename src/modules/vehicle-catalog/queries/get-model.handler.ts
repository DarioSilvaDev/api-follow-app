import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../common/database/prisma.service';
import { ModelDetailResponseDto } from '../dto/model-response.dto';

@Injectable()
export class GetModelHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(id: string): Promise<ModelDetailResponseDto> {
    const model = await this.prisma.vehicleModel.findUnique({
      where: { id },
      include: { brand: true },
    });
    if (!model) {
      throw new NotFoundException('Model not found');
    }
    return ModelDetailResponseDto.from(model);
  }
}
