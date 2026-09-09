import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import type { AuthenticatedUser } from '../../../common/types/auth.types';
import { JwtAuthGuard } from '../../auth/strategies/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { WorkshopOnlyGuard } from '../../../common/guards/workshop-only.guard';
import { ContextGuard } from '../../../common/context/guards/context.guard';
import { ActiveContext } from '../../../common/context/decorators/current-context.decorator';
import type { CurrentContext } from '../../../common/context/interfaces/current-context.interface';
import { PrismaService } from '../../../common/database/prisma.service';
import { VehicleAccessService } from '../../../common/authorization/vehicle-access.service';
import { AppointmentStatus, WorkOrderStatus } from '@prisma/client';
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
import { UpdateEstimateStatusDto } from '../dto/update-estimate-status.dto';
import { UpdateWorkOrderStatusDto } from '../dto/update-work-order-status.dto';
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
import { UpdateEstimateStatusCommand } from '../commands/update-estimate-status/update-estimate-status.command';
import { UpdateEstimateStatusHandler } from '../commands/update-estimate-status/update-estimate-status.handler';
import { ConvertEstimateCommand } from '../commands/convert-estimate/convert-estimate.command';
import { ConvertEstimateHandler } from '../commands/convert-estimate/convert-estimate.handler';

@Controller('maintenance')
@UseGuards(JwtAuthGuard, ContextGuard)
export class MaintenanceController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly vehicleAccessService: VehicleAccessService,
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
    private readonly updateEstimateStatusHandler: UpdateEstimateStatusHandler,
    private readonly convertEstimateHandler: ConvertEstimateHandler,
  ) {}

  // ──────────────────────────────────────────────────────────
  // Helpers
  // ──────────────────────────────────────────────────────────

  /**
   * Full-mode vehicle access check: ownership / access / workshop+association / super_admin.
   */
  private assertVehicleAccess(
    vehicleId: string,
    user: AuthenticatedUser,
    ctx: CurrentContext,
  ): Promise<void> {
    return this.vehicleAccessService.assertVehicleAccess({
      vehicleId,
      user,
      context: ctx,
    });
  }

  // ──────────────────────────────────────────────────────────
  // CREATE endpoints (validate vehicleId from DTO)
  // ──────────────────────────────────────────────────────────

  @Post('appointments')
  @UseGuards(WorkshopOnlyGuard, PermissionsGuard)
  @Permissions('appointment.create')
  async createAppointment(
    @Body() dto: CreateAppointmentDto,
    @ActiveContext() ctx: CurrentContext,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (ctx.type === 'WORKSHOP' && dto.workshopId !== ctx.workshopId) {
      throw new ForbiddenException(
        'Cannot create appointment for a different workshop',
      );
    }
    // D-024 A1: validate access to the vehicle
    await this.assertVehicleAccess(dto.vehicleId, user, ctx);
    const appointment = await this.createAppointmentHandler.execute(
      new CreateAppointmentCommand(dto, user.id),
    );
    return AppointmentResponseDto.from(appointment);
  }

  @Post('work-orders')
  @UseGuards(WorkshopOnlyGuard, PermissionsGuard)
  @Permissions('workorder.create')
  async createWorkOrder(
    @Body() dto: CreateWorkOrderDto,
    @ActiveContext() ctx: CurrentContext,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (ctx.type === 'WORKSHOP' && dto.workshopId !== ctx.workshopId) {
      throw new ForbiddenException(
        'Cannot create work order for a different workshop',
      );
    }
    await this.assertVehicleAccess(dto.vehicleId, user, ctx);
    const number = `WO-${Date.now()}`;
    const workOrder = await this.createWorkOrderHandler.execute(
      new CreateWorkOrderCommand(dto, user.id, number),
    );
    return WorkOrderResponseDto.from(workOrder);
  }

  @Post('service-records')
  @UseGuards(WorkshopOnlyGuard, PermissionsGuard)
  @Permissions('service-record.create')
  async createServiceRecord(
    @Body() dto: CreateServiceRecordDto,
    @ActiveContext() ctx: CurrentContext,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (ctx.type === 'WORKSHOP' && dto.workshopId !== ctx.workshopId) {
      throw new ForbiddenException(
        'Cannot create service record for a different workshop',
      );
    }
    await this.assertVehicleAccess(dto.vehicleId, user, ctx);
    const record = await this.createServiceRecordHandler.execute(
      new CreateServiceRecordCommand(dto),
    );
    return ServiceRecordResponseDto.from(record);
  }

  @Post('estimates')
  @UseGuards(WorkshopOnlyGuard, PermissionsGuard)
  @Permissions('estimate.create')
  async createEstimate(
    @Body() dto: CreateEstimateDto,
    @ActiveContext() ctx: CurrentContext,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (ctx.type === 'WORKSHOP' && dto.workshopId !== ctx.workshopId) {
      throw new ForbiddenException(
        'Cannot create estimate for a different workshop',
      );
    }
    await this.assertVehicleAccess(dto.vehicleId, user, ctx);
    const number = `EST-${Date.now()}`;
    const estimate = await this.createEstimateHandler.execute(
      new CreateEstimateCommand(dto, user.id, number),
    );
    return EstimateResponseDto.from(estimate);
  }

  // ──────────────────────────────────────────────────────────
  // LIST endpoints (vehicleId validated, workshop rules)
  // ──────────────────────────────────────────────────────────

  @Get('appointments')
  async listAppointments(
    @ActiveContext() ctx: CurrentContext,
    @CurrentUser() user: AuthenticatedUser,
    @Query('workshopId') workshopId?: string,
    @Query('vehicleId') vehicleId?: string,
    @Query('status') status?: AppointmentStatus,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    // D-024 A1: PERSONAL requires validated vehicleId
    if (ctx.type === 'PERSONAL') {
      if (workshopId) {
        throw new ForbiddenException(
          'Cannot list appointments for a workshop in PERSONAL context',
        );
      }
      if (!vehicleId) {
        throw new ForbiddenException(
          'vehicleId is required in PERSONAL context',
        );
      }
      await this.assertVehicleAccess(vehicleId, user, ctx);
    }

    // WORKSHOP: context workshopId takes precedence; mismatch → 403
    if (ctx.type === 'WORKSHOP') {
      if (workshopId && workshopId !== ctx.workshopId) {
        throw new ForbiddenException(
          'Cannot list appointments for a different workshop',
        );
      }
    }

    const effectiveWorkshopId =
      ctx.type === 'WORKSHOP' ? ctx.workshopId : workshopId;
    return this.listAppointmentsHandler.execute({
      workshopId: effectiveWorkshopId,
      vehicleId,
      status,
      page,
      limit,
    });
  }

  @Get('work-orders')
  async listWorkOrders(
    @ActiveContext() ctx: CurrentContext,
    @CurrentUser() user: AuthenticatedUser,
    @Query('workshopId') workshopId?: string,
    @Query('vehicleId') vehicleId?: string,
    @Query('status') status?: WorkOrderStatus,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    if (ctx.type === 'PERSONAL') {
      if (workshopId) {
        throw new ForbiddenException(
          'Cannot list work orders for a workshop in PERSONAL context',
        );
      }
      if (!vehicleId) {
        throw new ForbiddenException(
          'vehicleId is required in PERSONAL context',
        );
      }
      await this.assertVehicleAccess(vehicleId, user, ctx);
    }

    if (ctx.type === 'WORKSHOP') {
      if (workshopId && workshopId !== ctx.workshopId) {
        throw new ForbiddenException(
          'Cannot list work orders for a different workshop',
        );
      }
    }

    const effectiveWorkshopId =
      ctx.type === 'WORKSHOP' ? ctx.workshopId : workshopId;
    return this.listWorkOrdersHandler.execute({
      workshopId: effectiveWorkshopId,
      vehicleId,
      status,
      page,
      limit,
    });
  }

  // ──────────────────────────────────────────────────────────
  // SINGLE RESOURCE endpoints (validate vehicle access via resource)
  // ──────────────────────────────────────────────────────────

  @Get('appointments/:id')
  async getAppointment(
    @Param('id') id: string,
    @ActiveContext() ctx: CurrentContext,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const appointment = await this.getAppointmentHandler.execute(id);
    if (ctx.type === 'WORKSHOP' && appointment.workshopId !== ctx.workshopId) {
      throw new ForbiddenException(
        'Appointment does not belong to this workshop',
      );
    }
    await this.assertVehicleAccess(appointment.vehicleId, user, ctx);
    return AppointmentResponseDto.from(appointment);
  }

  @Patch('appointments/:id')
  @UseGuards(WorkshopOnlyGuard, PermissionsGuard)
  @Permissions('appointment.update')
  async updateAppointment(
    @Param('id') id: string,
    @Body() dto: UpdateAppointmentDto,
    @ActiveContext() ctx: CurrentContext,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const existing = await this.getAppointmentHandler.execute(id);
    if (ctx.type === 'WORKSHOP' && existing.workshopId !== ctx.workshopId) {
      throw new ForbiddenException(
        'Appointment does not belong to this workshop',
      );
    }
    await this.assertVehicleAccess(existing.vehicleId, user, ctx);
    return this.updateAppointmentHandler.execute(
      new UpdateAppointmentCommand(id, dto),
    );
  }

  @Post('appointments/:id/cancel')
  @UseGuards(WorkshopOnlyGuard, PermissionsGuard)
  @Permissions('appointment.cancel')
  async cancelAppointment(
    @Param('id') id: string,
    @ActiveContext() ctx: CurrentContext,
    @CurrentUser() user: AuthenticatedUser,
    @Body('reason') reason?: string,
  ) {
    const existing = await this.getAppointmentHandler.execute(id);
    if (ctx.type === 'WORKSHOP' && existing.workshopId !== ctx.workshopId) {
      throw new ForbiddenException(
        'Appointment does not belong to this workshop',
      );
    }
    await this.assertVehicleAccess(existing.vehicleId, user, ctx);
    return this.cancelAppointmentHandler.execute(
      new CancelAppointmentCommand(id, reason),
    );
  }

  @Get('work-orders/:id')
  async getWorkOrder(
    @Param('id') id: string,
    @ActiveContext() ctx: CurrentContext,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const workOrder = await this.getWorkOrderHandler.execute(id);
    if (ctx.type === 'WORKSHOP' && workOrder.workshopId !== ctx.workshopId) {
      throw new ForbiddenException(
        'Work order does not belong to this workshop',
      );
    }
    await this.assertVehicleAccess(workOrder.vehicleId, user, ctx);
    return WorkOrderResponseDto.from(workOrder);
  }

  @Patch('work-orders/:id/status')
  @UseGuards(WorkshopOnlyGuard, PermissionsGuard)
  @Permissions('workorder.close')
  async updateWorkOrderStatus(
    @Param('id') id: string,
    @Body() dto: UpdateWorkOrderStatusDto,
    @ActiveContext() ctx: CurrentContext,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const existing = await this.getWorkOrderHandler.execute(id);
    if (ctx.type === 'WORKSHOP' && existing.workshopId !== ctx.workshopId) {
      throw new ForbiddenException(
        'Work order does not belong to this workshop',
      );
    }
    await this.assertVehicleAccess(existing.vehicleId, user, ctx);
    return this.updateWorkOrderStatusHandler.execute(
      new UpdateWorkOrderStatusCommand(id, dto.status, dto.mileageOut),
    );
  }

  @Post('work-orders/:id/items')
  @UseGuards(WorkshopOnlyGuard, PermissionsGuard)
  @Permissions('workorder.item.add')
  async addWorkOrderItem(
    @Param('id') id: string,
    @Body() dto: AddWorkOrderItemDto,
    @ActiveContext() ctx: CurrentContext,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const existing = await this.getWorkOrderHandler.execute(id);
    if (ctx.type === 'WORKSHOP' && existing.workshopId !== ctx.workshopId) {
      throw new ForbiddenException(
        'Work order does not belong to this workshop',
      );
    }
    await this.assertVehicleAccess(existing.vehicleId, user, ctx);
    return this.addWorkOrderItemHandler.execute(
      new AddWorkOrderItemCommand(id, dto),
    );
  }

  @Get('vehicles/:vehicleId/history')
  async getVehicleServiceHistory(
    @Param('vehicleId') vehicleId: string,
    @ActiveContext() ctx: CurrentContext,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.assertVehicleAccess(vehicleId, user, ctx);
    return this.getVehicleServiceHistoryHandler.execute(
      vehicleId,
      ctx.type === 'WORKSHOP' ? ctx.workshopId : undefined,
    );
  }

  @Patch('estimates/:id/status')
  @UseGuards(WorkshopOnlyGuard, PermissionsGuard)
  @Permissions('estimate.approve')
  async updateEstimateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateEstimateStatusDto,
    @ActiveContext() ctx: CurrentContext,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const existing = await this.prisma.estimate.findUnique({
      where: { id },
      select: { workshopId: true, vehicleId: true },
    });
    if (!existing) {
      throw new NotFoundException('Estimate', id);
    }
    if (ctx.type === 'WORKSHOP' && existing.workshopId !== ctx.workshopId) {
      throw new ForbiddenException(
        'Estimate does not belong to this workshop',
      );
    }
    await this.assertVehicleAccess(existing.vehicleId, user, ctx);
    return this.updateEstimateStatusHandler.execute(
      new UpdateEstimateStatusCommand(id, dto.status),
    );
  }

  @Post('estimates/:id/convert')
  @UseGuards(WorkshopOnlyGuard, PermissionsGuard)
  @Permissions('estimate.convert')
  async convertEstimate(
    @Param('id') id: string,
    @ActiveContext() ctx: CurrentContext,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const existing = await this.prisma.estimate.findUnique({
      where: { id },
      select: { workshopId: true, vehicleId: true },
    });
    if (existing && ctx.type === 'WORKSHOP' && existing.workshopId !== ctx.workshopId) {
      throw new ForbiddenException(
        'Estimate does not belong to this workshop',
      );
    }
    if (existing) {
      await this.assertVehicleAccess(existing.vehicleId, user, ctx);
    }
    return this.convertEstimateHandler.execute(
      new ConvertEstimateCommand(id, user.id),
    );
  }
}
