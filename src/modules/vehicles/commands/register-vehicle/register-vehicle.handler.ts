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
    // D-037: normalizar placa (trim + mayúsculas) antes de buscar y de guardar,
    // para impedir duplicados tipo "abc123" vs "ABC123".
    const licensePlate = command.dto.licensePlate.trim().toUpperCase();

    const existing = await this.repository.findByLicensePlate(licensePlate);
    if (existing) {
      throw new ConflictException(
        'Ya existe un vehículo registrado con esa placa',
      );
    }

    const vehicle = await this.repository.create({
      ...command.dto,
      licensePlate,
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
