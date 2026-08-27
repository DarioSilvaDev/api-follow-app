import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../../common/database/prisma.service';
import { CreateVersionCommand } from './create-version.command';
import { VersionResponseDto } from '../../dto/version-response.dto';

@Injectable()
export class CreateVersionHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: CreateVersionCommand): Promise<VersionResponseDto> {
    const dto = command.dto;

    const model = await this.prisma.vehicleModel.findUnique({
      where: { id: dto.modelId },
    });
    if (!model) {
      throw new NotFoundException('Model not found');
    }

    const version = await this.prisma.vehicleVersion.create({
      data: {
        modelId: dto.modelId,
        name: dto.name,
        productionFrom: dto.productionFrom ?? null,
        productionTo: dto.productionTo ?? null,
        engineCode: dto.engineCode ?? null,
        engineDisplacement: dto.engineDisplacement ?? null,
        horsepower: dto.horsepower ?? null,
        fuelType: (dto.fuelType as any) ?? 'gasoline',
        transmission: (dto.transmission as any) ?? 'manual',
        bodyType: (dto.bodyType as any) ?? 'sedan',
        doors: dto.doors ?? null,
      },
    });

    return VersionResponseDto.from(version);
  }
}
