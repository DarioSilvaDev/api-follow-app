import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../../../common/database/prisma.service';
import { CreateModelCommand } from './create-model.command';
import { ModelResponseDto } from '../../dto/model-response.dto';

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

@Injectable()
export class CreateModelHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: CreateModelCommand): Promise<ModelResponseDto> {
    const { brandId, name, isActive } = command.dto;

    const brand = await this.prisma.vehicleBrand.findUnique({
      where: { id: brandId },
    });
    if (!brand) {
      throw new NotFoundException('Brand not found');
    }

    const slug = slugify(name);
    const existing = await this.prisma.vehicleModel.findUnique({
      where: { brandId_slug: { brandId, slug } },
    });
    if (existing) {
      throw new ConflictException(
        `Model "${name}" already exists for this brand`,
      );
    }

    const model = await this.prisma.vehicleModel.create({
      data: { brandId, name, slug, isActive: isActive ?? true },
    });

    return ModelResponseDto.from(model);
  }
}
