import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/strategies/jwt-auth.guard';
import { RegisterVehicleDto } from '../dto/register-vehicle.dto';
import { UpdateVehicleDto } from '../dto/update-vehicle.dto';
import { TransferVehicleDto } from '../dto/transfer-vehicle.dto';
import { RecordMileageDto } from '../dto/record-mileage.dto';
import { GrantAccessDto } from '../dto/grant-access.dto';
import { VehicleResponseDto } from '../dto/vehicle-response.dto';
import { RegisterVehicleCommand } from '../commands/register-vehicle/register-vehicle.command';
import { RegisterVehicleHandler } from '../commands/register-vehicle/register-vehicle.handler';
import { UpdateVehicleCommand } from '../commands/update-vehicle/update-vehicle.command';
import { UpdateVehicleHandler } from '../commands/update-vehicle/update-vehicle.handler';
import { DeleteVehicleCommand } from '../commands/delete-vehicle/delete-vehicle.command';
import { DeleteVehicleHandler } from '../commands/delete-vehicle/delete-vehicle.handler';
import { TransferVehicleCommand } from '../commands/transfer-vehicle/transfer-vehicle.command';
import { TransferVehicleHandler } from '../commands/transfer-vehicle/transfer-vehicle.handler';
import { RecordMileageCommand } from '../commands/record-mileage/record-mileage.command';
import { RecordMileageHandler } from '../commands/record-mileage/record-mileage.handler';
import { GrantAccessCommand } from '../commands/grant-access/grant-access.command';
import { GrantAccessHandler } from '../commands/grant-access/grant-access.handler';
import { GetVehicleHandler } from '../queries/get-vehicle/get-vehicle.handler';
import { ListVehiclesHandler } from '../queries/list-vehicles/list-vehicles.handler';
import { GetVehicleHistoryHandler } from '../queries/get-vehicle-history/get-vehicle-history.handler';

@Controller('vehicles')
@UseGuards(JwtAuthGuard)
export class VehiclesController {
  constructor(
    private readonly registerVehicleHandler: RegisterVehicleHandler,
    private readonly updateVehicleHandler: UpdateVehicleHandler,
    private readonly deleteVehicleHandler: DeleteVehicleHandler,
    private readonly transferVehicleHandler: TransferVehicleHandler,
    private readonly recordMileageHandler: RecordMileageHandler,
    private readonly grantAccessHandler: GrantAccessHandler,
    private readonly getVehicleHandler: GetVehicleHandler,
    private readonly listVehiclesHandler: ListVehiclesHandler,
    private readonly getVehicleHistoryHandler: GetVehicleHistoryHandler,
  ) {}

  @Post()
  async create(@Body() dto: RegisterVehicleDto, @Req() req: any) {
    const vehicle = await this.registerVehicleHandler.execute(
      new RegisterVehicleCommand(dto, req.user.id),
    );
    return VehicleResponseDto.from(vehicle);
  }

  @Get()
  async findAll(
    @Req() req: any,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.listVehiclesHandler.execute({
      userId: req.user.id,
      page,
      limit,
    });
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const vehicle = await this.getVehicleHandler.execute(id);
    return VehicleResponseDto.from(vehicle);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateVehicleDto) {
    return this.updateVehicleHandler.execute(new UpdateVehicleCommand(id, dto));
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    await this.deleteVehicleHandler.execute(new DeleteVehicleCommand(id));
  }

  @Post(':id/transfer')
  async transfer(
    @Param('id') id: string,
    @Body() dto: TransferVehicleDto,
    @Req() req: any,
  ) {
    return this.transferVehicleHandler.execute(
      new TransferVehicleCommand(id, dto, req.user.id),
    );
  }

  @Post(':id/mileage')
  async recordMileage(
    @Param('id') id: string,
    @Body() dto: RecordMileageDto,
    @Req() req: any,
  ) {
    return this.recordMileageHandler.execute(
      new RecordMileageCommand(id, dto, req.user.id),
    );
  }

  @Post(':id/access')
  async grantAccess(
    @Param('id') id: string,
    @Body() dto: GrantAccessDto,
    @Req() req: any,
  ) {
    return this.grantAccessHandler.execute(
      new GrantAccessCommand(id, dto, req.user.id),
    );
  }

  @Get(':id/history')
  async getHistory(@Param('id') id: string) {
    return this.getVehicleHistoryHandler.execute(id);
  }
}
