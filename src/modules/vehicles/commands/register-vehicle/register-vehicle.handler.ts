import { Inject, Injectable, ConflictException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { VEHICLE_REPOSITORY } from '../../tokens';
import type { VehicleRepository } from '../../repositories/vehicle.repository';
import { VehicleRegisteredEvent } from '../../events/vehicle-registered.event';
import { RegisterVehicleCommand } from './register-vehicle.command';

@Injectable()
export class RegisterVehicleHandler {
  constructor(
    @Inject(VEHICLE_REPOSITORY)
    private readonly repository: VehicleRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async execute(command: RegisterVehicleCommand) {
    const existing = await this.repository.findByLicensePlate(
      command.dto.licensePlate,
    );
    if (existing) {
      throw new ConflictException(
        `Vehicle with plate '${command.dto.licensePlate}' already exists`,
      );
    }

    const vehicle = await this.repository.create({
      ...command.dto,
      ownerId: command.ownerId,
    });

    this.eventEmitter.emit(
      'vehicle.registered',
      new VehicleRegisteredEvent(
        vehicle.id,
        command.ownerId,
        vehicle.licensePlate,
      ),
    );

    return vehicle;
  }
}
