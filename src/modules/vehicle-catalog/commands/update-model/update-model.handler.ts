import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../../../common/database/prisma.service';
import { UpdateModelCommand } from './update-model.command';
import { ModelResponseDto } from '../../dto/model-response.dto';

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

@Injectable()
export class UpdateModelHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: UpdateModelCommand): Promise<ModelResponseDto> {
    const { id, dto } = command;

    const model = await this.prisma.vehicleModel.findUnique({ where: { id } });
    if (!model) {
      throw new NotFoundException('Model not found');
    }

    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) {
      const brandId = dto.brandId ?? model.brandId;
      const slug = slugify(dto.name);
      const existing = await this.prisma.vehicleModel.findUnique({
        where: { brandId_slug: { brandId, slug } },
      });
      if (existing && existing.id !== id) {
        throw new ConflictException(
          `Model "${dto.name}" already exists for this brand`,
        );
      }
      data.name = dto.name;
      data.slug = slug;
    }
    if (dto.brandId !== undefined) {
      const brand = await this.prisma.vehicleBrand.findUnique({
        where: { id: dto.brandId },
      });
      if (!brand) {
        throw new NotFoundException('Brand not found');
      }
      data.brandId = dto.brandId;
    }
    if (dto.isActive !== undefined) data.isActive = dto.isActive;

    const updated = await this.prisma.vehicleModel.update({
      where: { id },
      data,
    });

    return ModelResponseDto.from(updated);
  }
}
