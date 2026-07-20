import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../../common/types/auth.types';
import { JwtAuthGuard } from '../../auth/strategies/jwt-auth.guard';
import {
  CreateAppointmentDto,
  UpdateAppointmentDto,
  CreateWorkOrderDto,
  AddWorkOrderItemDto,
  CreateServiceRecordDto,
  CreateEstimateDto,
  AppointmentResponseDto,
  WorkOrderResponseDto,
  ServiceRecordResponseDto,
  EstimateResponseDto,
} from '../dto/index';
import { CreateAppointmentCommand } from '../commands/create-appointment/create-appointment.command';
import { CreateAppointmentHandler } from '../commands/create-appointment/create-appointment.handler';
import { UpdateAppointmentCommand } from '../commands/update-appointment/update-appointment.command';
import { UpdateAppointmentHandler } from '../commands/update-appointment/update-appointment.handler';
import { CancelAppointmentCommand } from '../commands/cancel-appointment/cancel-appointment.command';
import { CancelAppointmentHandler } from '../commands/cancel-appointment/cancel-appointment.handler';
import { CreateWorkOrderCommand } from '../commands/create-work-order/create-work-order.command';
import { CreateWorkOrderHandler } from '../commands/create-work-order/create-work-order.handler';
import { UpdateWorkOrderStatusCommand } from '../commands/update-work-order-status/update-work-order-status.command';
import { UpdateWorkOrderStatusHandler } from '../commands/update-work-order-status/update-work-order-status.handler';
import { AddWorkOrderItemCommand } from '../commands/add-work-order-item/add-work-order-item.command';
import { AddWorkOrderItemHandler } from '../commands/add-work-order-item/add-work-order-item.handler';
import { CreateServiceRecordCommand } from '../commands/create-service-record/create-service-record.command';
import { CreateServiceRecordHandler } from '../commands/create-service-record/create-service-record.handler';
import { CreateEstimateCommand } from '../commands/create-estimate/create-estimate.command';
import { CreateEstimateHandler } from '../commands/create-estimate/create-estimate.handler';
import { GetAppointmentHandler } from '../queries/get-appointment/get-appointment.handler';
import { ListAppointmentsHandler } from '../queries/list-appointments/list-appointments.handler';
import { GetWorkOrderHandler } from '../queries/get-work-order/get-work-order.handler';
import { ListWorkOrdersHandler } from '../queries/list-work-orders/list-work-orders.handler';
import { GetVehicleServiceHistoryHandler } from '../queries/get-vehicle-service-history/get-vehicle-service-history.handler';

@Controller('maintenance')
@UseGuards(JwtAuthGuard)
export class MaintenanceController {
  constructor(
    private readonly createAppointmentHandler: CreateAppointmentHandler,
    private readonly updateAppointmentHandler: UpdateAppointmentHandler,
    private readonly cancelAppointmentHandler: CancelAppointmentHandler,
    private readonly createWorkOrderHandler: CreateWorkOrderHandler,
    private readonly updateWorkOrderStatusHandler: UpdateWorkOrderStatusHandler,
    private readonly addWorkOrderItemHandler: AddWorkOrderItemHandler,
    private readonly createServiceRecordHandler: CreateServiceRecordHandler,
    private readonly createEstimateHandler: CreateEstimateHandler,
    private readonly getAppointmentHandler: GetAppointmentHandler,
    private readonly listAppointmentsHandler: ListAppointmentsHandler,
    private readonly getWorkOrderHandler: GetWorkOrderHandler,
    private readonly listWorkOrdersHandler: ListWorkOrdersHandler,
    private readonly getVehicleServiceHistoryHandler: GetVehicleServiceHistoryHandler,
  ) {}

  @Post('appointments')
  async createAppointment(@Body() dto: CreateAppointmentDto, @CurrentUser() user: AuthenticatedUser) {
    const appointment = await this.createAppointmentHandler.execute(
      new CreateAppointmentCommand(dto, user.id),
    );
    return AppointmentResponseDto.from(appointment);
  }

  @Get('appointments')
  async listAppointments(
    @Query('workshopId') workshopId?: string,
    @Query('vehicleId') vehicleId?: string,
    @Query('status') status?: any,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.listAppointmentsHandler.execute({
      workshopId,
      vehicleId,
      status,
      page,
      limit,
    });
  }

  @Get('appointments/:id')
  async getAppointment(@Param('id') id: string) {
    const appointment = await this.getAppointmentHandler.execute(id);
    return AppointmentResponseDto.from(appointment);
  }

  @Patch('appointments/:id')
  async updateAppointment(
    @Param('id') id: string,
    @Body() dto: UpdateAppointmentDto,
  ) {
    return this.updateAppointmentHandler.execute(
      new UpdateAppointmentCommand(id, dto),
    );
  }

  @Post('appointments/:id/cancel')
  async cancelAppointment(
    @Param('id') id: string,
    @Body('reason') reason?: string,
  ) {
    return this.cancelAppointmentHandler.execute(
      new CancelAppointmentCommand(id, reason),
    );
  }

  @Post('work-orders')
  async createWorkOrder(@Body() dto: CreateWorkOrderDto, @CurrentUser() user: AuthenticatedUser) {
    const number = `WO-${Date.now()}`;
    const workOrder = await this.createWorkOrderHandler.execute(
      new CreateWorkOrderCommand(dto, user.id, number),
    );
    return WorkOrderResponseDto.from(workOrder);
  }

  @Get('work-orders')
  async listWorkOrders(
    @Query('workshopId') workshopId?: string,
    @Query('vehicleId') vehicleId?: string,
    @Query('status') status?: any,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.listWorkOrdersHandler.execute({
      workshopId,
      vehicleId,
      status,
      page,
      limit,
    });
  }

  @Get('work-orders/:id')
  async getWorkOrder(@Param('id') id: string) {
    const workOrder = await this.getWorkOrderHandler.execute(id);
    return WorkOrderResponseDto.from(workOrder);
  }

  @Patch('work-orders/:id/status')
  async updateWorkOrderStatus(
    @Param('id') id: string,
    @Body('status') status: string,
  ) {
    return this.updateWorkOrderStatusHandler.execute(
      new UpdateWorkOrderStatusCommand(id, status),
    );
  }

  @Post('work-orders/:id/items')
  async addWorkOrderItem(
    @Param('id') id: string,
    @Body() dto: AddWorkOrderItemDto,
  ) {
    return this.addWorkOrderItemHandler.execute(
      new AddWorkOrderItemCommand(id, dto),
    );
  }

  @Post('service-records')
  async createServiceRecord(@Body() dto: CreateServiceRecordDto) {
    const record = await this.createServiceRecordHandler.execute(
      new CreateServiceRecordCommand(dto),
    );
    return ServiceRecordResponseDto.from(record);
  }

  @Get('vehicles/:vehicleId/history')
  async getVehicleServiceHistory(@Param('vehicleId') vehicleId: string) {
    return this.getVehicleServiceHistoryHandler.execute(vehicleId);
  }

  @Post('estimates')
  async createEstimate(@Body() dto: CreateEstimateDto, @CurrentUser() user: AuthenticatedUser) {
    const number = `EST-${Date.now()}`;
    const estimate = await this.createEstimateHandler.execute(
      new CreateEstimateCommand(dto, user.id, number),
    );
    return EstimateResponseDto.from(estimate);
  }
}
