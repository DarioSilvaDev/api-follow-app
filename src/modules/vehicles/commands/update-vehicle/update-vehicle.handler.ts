import { Inject, Injectable } from '@nestjs/common';
import { NotFoundException } from '../../../../common/exceptions/not-found.exception';
import { VEHICLE_REPOSITORY } from '../../tokens';
import type { VehicleRepository } from '../../repositories/vehicle.repository';
import { UpdateVehicleCommand } from './update-vehicle.command';

@Injectable()
export class UpdateVehicleHandler {
  constructor(
    @Inject(VEHICLE_REPOSITORY)
    private readonly repository: VehicleRepository,
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
    return this.repository.update(command.id, dto);
  }
}
