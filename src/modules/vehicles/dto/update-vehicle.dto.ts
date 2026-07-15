import { PartialType } from '@nestjs/mapped-types';
import { RegisterVehicleDto } from './register-vehicle.dto';

export class UpdateVehicleDto extends PartialType(RegisterVehicleDto) {}
