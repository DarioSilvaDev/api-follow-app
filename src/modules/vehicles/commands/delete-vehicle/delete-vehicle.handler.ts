import { Inject, Injectable } from '@nestjs/common';
import { NotFoundException } from '../../../../common/exceptions/not-found.exception';
import { VEHICLE_REPOSITORY } from '../../tokens';
import type { VehicleRepository } from '../../repositories/vehicle.repository';
import { DeleteVehicleCommand } from './delete-vehicle.command';

@Injectable()
export class DeleteVehicleHandler {
  constructor(
    @Inject(VEHICLE_REPOSITORY)
    private readonly repository: VehicleRepository,
  ) {}

  async execute(command: DeleteVehicleCommand) {
    const existing = await this.repository.findById(command.id);
    if (!existing) {
      throw new NotFoundException('Vehicle', command.id);
    }
    await this.repository.delete(command.id);
  }
}
