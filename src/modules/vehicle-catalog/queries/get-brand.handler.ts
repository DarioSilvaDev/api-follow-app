import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../common/database/prisma.service';
import { BrandDetailResponseDto } from '../dto/brand-response.dto';

@Injectable()
export class GetBrandHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(id: string): Promise<BrandDetailResponseDto> {
    const brand = await this.prisma.vehicleBrand.findUnique({
      where: { id },
      include: { models: true },
    });
    if (!brand) {
      throw new NotFoundException('Brand not found');
    }
    return BrandDetailResponseDto.from(brand);
  }
}
