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
    if (!existing) {
      throw new NotFoundException('Vehicle', command.id);
    }
    return this.repository.update(command.id, command.dto);
  }
}
