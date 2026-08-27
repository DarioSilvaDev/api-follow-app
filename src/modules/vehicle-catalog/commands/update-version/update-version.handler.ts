import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../../common/database/prisma.service';
import { UpdateVersionCommand } from './update-version.command';
import { VersionResponseDto } from '../../dto/version-response.dto';

@Injectable()
export class UpdateVersionHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: UpdateVersionCommand): Promise<VersionResponseDto> {
    const { id, dto } = command;

    const version = await this.prisma.vehicleVersion.findUnique({
      where: { id },
    });
    if (!version) {
      throw new NotFoundException('Version not found');
    }

    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.modelId !== undefined) {
      const model = await this.prisma.vehicleModel.findUnique({
        where: { id: dto.modelId },
      });
      if (!model) throw new NotFoundException('Model not found');
      data.modelId = dto.modelId;
    }
    if (dto.productionFrom !== undefined)
      data.productionFrom = dto.productionFrom;
    if (dto.productionTo !== undefined) data.productionTo = dto.productionTo;
    if (dto.engineCode !== undefined) data.engineCode = dto.engineCode;
    if (dto.engineDisplacement !== undefined)
      data.engineDisplacement = dto.engineDisplacement;
    if (dto.horsepower !== undefined) data.horsepower = dto.horsepower;
    if (dto.fuelType !== undefined) data.fuelType = dto.fuelType;
    if (dto.transmission !== undefined) data.transmission = dto.transmission;
    if (dto.bodyType !== undefined) data.bodyType = dto.bodyType;
    if (dto.doors !== undefined) data.doors = dto.doors;

    const updated = await this.prisma.vehicleVersion.update({
      where: { id },
      data,
    });

    return VersionResponseDto.from(updated);
  }
}
