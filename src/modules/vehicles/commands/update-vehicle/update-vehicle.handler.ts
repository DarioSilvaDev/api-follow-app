import { Inject, Injectable } from '@nestjs/common';
import { NotFoundException } from '../../../../common/exceptions/not-found.exception';
import { PrismaService } from '../../../../common/database/prisma.service';
import { VEHICLE_REPOSITORY } from '../../tokens';
import type {
  UpdateVehicleData,
  VehicleRepository,
} from '../../repositories/vehicle.repository';
import { UpdateVehicleCommand } from './update-vehicle.command';
import {
  resolveCatalogBrandModel,
  stripCatalogPair,
} from '../../utils/vehicle-catalog-pair';

@Injectable()
export class UpdateVehicleHandler {
  constructor(
    @Inject(VEHICLE_REPOSITORY)
    private readonly repository: VehicleRepository,
    private readonly prisma: PrismaService,
  ) {}

  async execute(command: UpdateVehicleCommand) {
    const existing = await this.repository.findById(command.id);
    if (!existing || existing.deletedAt) {
      throw new NotFoundException('Vehicle', command.id);
    }
    // D-040: PATCH parcial — si no se envía ningún campo, no-op 200.
    // No llamamos a prisma.vehicle.update({ data: {} }) (frágil): devolvemos
    // el registro existente tal cual.
    if (Object.keys(command.dto).length === 0) {
      return existing;
    }
    // D-042: normalizar placa (trim + mayúsculas) al editar, igual que register
    // (D-037). Solo si viene en el PATCH parcial (D-040): si no se envía
    // licensePlate, no se toca la placa existente.
    const dto =
      command.dto.licensePlate !== undefined
        ? {
            ...command.dto,
            licensePlate: command.dto.licensePlate.trim().toUpperCase(),
          }
        : command.dto;

    // MVP sin versiones: `brandId`/`modelId` (ambos o ninguno) se resuelven en
    // el catálogo y reemplazan a `versionId` (se limpia, D-160). Omitidos = no
    // se tocan `brandName`/`modelName`/`versionId` existentes.
    const catalog = await resolveCatalogBrandModel(this.prisma, dto);
    const data: UpdateVehicleData = { ...stripCatalogPair(dto) };

    if (catalog) {
      data.brandName = catalog.brandName;
      data.modelName = catalog.modelName;
      data.versionId = null;
    }

    // Sólo vinieron IDs nulos: se comporta como PATCH vacío (no-op 200).
    if (Object.keys(data).length === 0) {
      return existing;
    }

    return this.repository.update(command.id, data);
  }
}
