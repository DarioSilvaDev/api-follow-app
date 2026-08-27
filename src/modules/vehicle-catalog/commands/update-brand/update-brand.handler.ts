import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../../../common/database/prisma.service';
import { UpdateBrandCommand } from './update-brand.command';
import { BrandResponseDto } from '../../dto/brand-response.dto';

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

@Injectable()
export class UpdateBrandHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: UpdateBrandCommand): Promise<BrandResponseDto> {
    const { id, dto } = command;

    const brand = await this.prisma.vehicleBrand.findUnique({ where: { id } });
    if (!brand) {
      throw new NotFoundException('Brand not found');
    }

    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) {
      const slug = slugify(dto.name);
      const existing = await this.prisma.vehicleBrand.findUnique({
        where: { slug },
      });
      if (existing && existing.id !== id) {
        throw new ConflictException(`Brand "${dto.name}" already exists`);
      }
      data.name = dto.name;
      data.slug = slug;
    }
    if (dto.logoUrl !== undefined) data.logoUrl = dto.logoUrl;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;

    const updated = await this.prisma.vehicleBrand.update({
      where: { id },
      data,
    });

    return BrandResponseDto.from(updated);
  }
}
