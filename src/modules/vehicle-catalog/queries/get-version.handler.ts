import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../common/database/prisma.service';
import { VersionDetailResponseDto } from '../dto/version-response.dto';

@Injectable()
export class GetVersionHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(id: string): Promise<VersionDetailResponseDto> {
    const version = await this.prisma.vehicleVersion.findUnique({
      where: { id },
      include: { model: true },
    });
    if (!version) {
      throw new NotFoundException('Version not found');
    }
    return VersionDetailResponseDto.from(version);
  }
}
