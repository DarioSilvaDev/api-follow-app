import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/database/prisma.service';
import { BrandResponseDto } from '../dto/brand-response.dto';

@Injectable()
export class ListBrandsHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(includeInactive = false): Promise<BrandResponseDto[]> {
    const where = includeInactive ? {} : { isActive: true };
    const brands = await this.prisma.vehicleBrand.findMany({
      where,
      orderBy: { name: 'asc' },
    });
    return brands.map((b) => BrandResponseDto.from(b));
  }
}
