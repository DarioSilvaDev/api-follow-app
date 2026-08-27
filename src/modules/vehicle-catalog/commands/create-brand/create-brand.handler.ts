import { Injectable, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../../../common/database/prisma.service';
import { CreateBrandCommand } from './create-brand.command';
import { BrandResponseDto } from '../../dto/brand-response.dto';

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

@Injectable()
export class CreateBrandHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: CreateBrandCommand): Promise<BrandResponseDto> {
    const { name, logoUrl, isActive } = command.dto;
    const slug = slugify(name);

    const existing = await this.prisma.vehicleBrand.findUnique({
      where: { slug },
    });
    if (existing) {
      throw new ConflictException(`Brand "${name}" already exists`);
    }

    const brand = await this.prisma.vehicleBrand.create({
      data: {
        name,
        slug,
        logoUrl: logoUrl ?? null,
        isActive: isActive ?? true,
      },
    });

    return BrandResponseDto.from(brand);
  }
}
