import { Module } from '@nestjs/common';
import { MaintenanceController } from './controllers/maintenance.controller';
import { PrismaMaintenanceRepository } from './repositories/prisma-maintenance.repository';
import { MAINTENANCE_REPOSITORY } from './tokens';
import { CreateAppointmentHandler } from './commands/create-appointment/create-appointment.handler';
import { UpdateAppointmentHandler } from './commands/update-appointment/update-appointment.handler';
import { CancelAppointmentHandler } from './commands/cancel-appointment/cancel-appointment.handler';
import { CreateWorkOrderHandler } from './commands/create-work-order/create-work-order.handler';
import { UpdateWorkOrderStatusHandler } from './commands/update-work-order-status/update-work-order-status.handler';
import { AddWorkOrderItemHandler } from './commands/add-work-order-item/add-work-order-item.handler';
import { CreateServiceRecordHandler } from './commands/create-service-record/create-service-record.handler';
import { CreateEstimateHandler } from './commands/create-estimate/create-estimate.handler';
import { GetAppointmentHandler } from './queries/get-appointment/get-appointment.handler';
import { ListAppointmentsHandler } from './queries/list-appointments/list-appointments.handler';
import { GetWorkOrderHandler } from './queries/get-work-order/get-work-order.handler';
import { ListWorkOrdersHandler } from './queries/list-work-orders/list-work-orders.handler';
import { GetVehicleServiceHistoryHandler } from './queries/get-vehicle-service-history/get-vehicle-service-history.handler';

@Module({
  controllers: [MaintenanceController],
  providers: [
    CreateAppointmentHandler,
    UpdateAppointmentHandler,
    CancelAppointmentHandler,
    CreateWorkOrderHandler,
    UpdateWorkOrderStatusHandler,
    AddWorkOrderItemHandler,
    CreateServiceRecordHandler,
    CreateEstimateHandler,
    GetAppointmentHandler,
    ListAppointmentsHandler,
    GetWorkOrderHandler,
    ListWorkOrdersHandler,
    GetVehicleServiceHistoryHandler,
    { provide: MAINTENANCE_REPOSITORY, useClass: PrismaMaintenanceRepository },
  ],
  exports: [MAINTENANCE_REPOSITORY],
})
export class MaintenanceModule {}
