import { Module } from '@nestjs/common';
import { VehiclesController } from './controllers/vehicles.controller';
import { PrismaVehicleRepository } from './repositories/prisma-vehicle.repository';
import { VEHICLE_REPOSITORY } from './tokens';
import { RegisterVehicleHandler } from './commands/register-vehicle/register-vehicle.handler';
import { UpdateVehicleHandler } from './commands/update-vehicle/update-vehicle.handler';
import { DeleteVehicleHandler } from './commands/delete-vehicle/delete-vehicle.handler';
import { TransferVehicleHandler } from './commands/transfer-vehicle/transfer-vehicle.handler';
import { RecordMileageHandler } from './commands/record-mileage/record-mileage.handler';
import { GrantAccessHandler } from './commands/grant-access/grant-access.handler';
import { GetVehicleHandler } from './queries/get-vehicle/get-vehicle.handler';
import { ListVehiclesHandler } from './queries/list-vehicles/list-vehicles.handler';
import { GetVehicleHistoryHandler } from './queries/get-vehicle-history/get-vehicle-history.handler';

@Module({
  controllers: [VehiclesController],
  providers: [
    RegisterVehicleHandler,
    UpdateVehicleHandler,
    DeleteVehicleHandler,
    TransferVehicleHandler,
    RecordMileageHandler,
    GrantAccessHandler,
    GetVehicleHandler,
    ListVehiclesHandler,
    GetVehicleHistoryHandler,
    { provide: VEHICLE_REPOSITORY, useClass: PrismaVehicleRepository },
  ],
  exports: [VEHICLE_REPOSITORY],
})
export class VehiclesModule {}
