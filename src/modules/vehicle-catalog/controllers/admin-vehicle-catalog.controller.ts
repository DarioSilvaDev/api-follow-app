import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/strategies/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { CreateBrandDto } from '../dto/create-brand.dto';
import { UpdateBrandDto } from '../dto/update-brand.dto';
import { CreateModelDto } from '../dto/create-model.dto';
import { UpdateModelDto } from '../dto/update-model.dto';
import { CreateVersionDto } from '../dto/create-version.dto';
import { UpdateVersionDto } from '../dto/update-version.dto';
import { CreateBrandCommand } from '../commands/create-brand/create-brand.command';
import { CreateBrandHandler } from '../commands/create-brand/create-brand.handler';
import { UpdateBrandCommand } from '../commands/update-brand/update-brand.command';
import { UpdateBrandHandler } from '../commands/update-brand/update-brand.handler';
import { DeleteBrandCommand } from '../commands/delete-brand/delete-brand.command';
import { DeleteBrandHandler } from '../commands/delete-brand/delete-brand.handler';
import { CreateModelCommand } from '../commands/create-model/create-model.command';
import { CreateModelHandler } from '../commands/create-model/create-model.handler';
import { UpdateModelCommand } from '../commands/update-model/update-model.command';
import { UpdateModelHandler } from '../commands/update-model/update-model.handler';
import { DeleteModelCommand } from '../commands/delete-model/delete-model.command';
import { DeleteModelHandler } from '../commands/delete-model/delete-model.handler';
import { CreateVersionCommand } from '../commands/create-version/create-version.command';
import { CreateVersionHandler } from '../commands/create-version/create-version.handler';
import { UpdateVersionCommand } from '../commands/update-version/update-version.command';
import { UpdateVersionHandler } from '../commands/update-version/update-version.handler';
import { DeleteVersionCommand } from '../commands/delete-version/delete-version.command';
import { DeleteVersionHandler } from '../commands/delete-version/delete-version.handler';
import { ListBrandsHandler } from '../queries/list-brands.handler';
import { GetBrandHandler } from '../queries/get-brand.handler';
import { ListModelsHandler } from '../queries/list-models.handler';
import { GetModelHandler } from '../queries/get-model.handler';
import { ListVersionsHandler } from '../queries/list-versions.handler';
import { GetVersionHandler } from '../queries/get-version.handler';

@Controller('admin')
@UseGuards(JwtAuthGuard)
export class AdminVehicleCatalogController {
  constructor(
    private readonly createBrandHandler: CreateBrandHandler,
    private readonly updateBrandHandler: UpdateBrandHandler,
    private readonly deleteBrandHandler: DeleteBrandHandler,
    private readonly createModelHandler: CreateModelHandler,
    private readonly updateModelHandler: UpdateModelHandler,
    private readonly deleteModelHandler: DeleteModelHandler,
    private readonly createVersionHandler: CreateVersionHandler,
    private readonly updateVersionHandler: UpdateVersionHandler,
    private readonly deleteVersionHandler: DeleteVersionHandler,
    private readonly listBrandsHandler: ListBrandsHandler,
    private readonly getBrandHandler: GetBrandHandler,
    private readonly listModelsHandler: ListModelsHandler,
    private readonly getModelHandler: GetModelHandler,
    private readonly listVersionsHandler: ListVersionsHandler,
    private readonly getVersionHandler: GetVersionHandler,
  ) {}

  @Get('vehicle-brands')
  @UseGuards(PermissionsGuard)
  @Permissions('admin.vehicle-catalog.brands.list')
  async listBrands(@Query('includeInactive') includeInactive?: string) {
    const brands = await this.listBrandsHandler.execute(
      includeInactive === 'true',
    );
    return brands;
  }

  @Get('vehicle-brands/:id')
  @UseGuards(PermissionsGuard)
  @Permissions('admin.vehicle-catalog.brands.read')
  async getBrand(@Param('id') id: string) {
    return this.getBrandHandler.execute(id);
  }

  @Post('vehicle-brands')
  @UseGuards(PermissionsGuard)
  @Permissions('admin.vehicle-catalog.brands.create')
  async createBrand(@Body() dto: CreateBrandDto) {
    return this.createBrandHandler.execute(new CreateBrandCommand(dto));
  }

  @Patch('vehicle-brands/:id')
  @UseGuards(PermissionsGuard)
  @Permissions('admin.vehicle-catalog.brands.update')
  async updateBrand(@Param('id') id: string, @Body() dto: UpdateBrandDto) {
    return this.updateBrandHandler.execute(new UpdateBrandCommand(id, dto));
  }

  @Delete('vehicle-brands/:id')
  @UseGuards(PermissionsGuard)
  @Permissions('admin.vehicle-catalog.brands.delete')
  async deleteBrand(@Param('id') id: string) {
    await this.deleteBrandHandler.execute(new DeleteBrandCommand(id));
  }

  @Get('vehicle-models')
  @UseGuards(PermissionsGuard)
  @Permissions('admin.vehicle-catalog.models.list')
  async listModels(
    @Query('brandId') brandId?: string,
    @Query('includeInactive') includeInactive?: string,
  ) {
    const models = await this.listModelsHandler.execute(
      brandId,
      includeInactive === 'true',
    );
    return models;
  }

  @Get('vehicle-models/:id')
  @UseGuards(PermissionsGuard)
  @Permissions('admin.vehicle-catalog.models.read')
  async getModel(@Param('id') id: string) {
    return this.getModelHandler.execute(id);
  }

  @Post('vehicle-models')
  @UseGuards(PermissionsGuard)
  @Permissions('admin.vehicle-catalog.models.create')
  async createModel(@Body() dto: CreateModelDto) {
    return this.createModelHandler.execute(new CreateModelCommand(dto));
  }

  @Patch('vehicle-models/:id')
  @UseGuards(PermissionsGuard)
  @Permissions('admin.vehicle-catalog.models.update')
  async updateModel(@Param('id') id: string, @Body() dto: UpdateModelDto) {
    return this.updateModelHandler.execute(new UpdateModelCommand(id, dto));
  }

  @Delete('vehicle-models/:id')
  @UseGuards(PermissionsGuard)
  @Permissions('admin.vehicle-catalog.models.delete')
  async deleteModel(@Param('id') id: string) {
    await this.deleteModelHandler.execute(new DeleteModelCommand(id));
  }

  @Get('vehicle-versions')
  @UseGuards(PermissionsGuard)
  @Permissions('admin.vehicle-catalog.versions.list')
  async listVersions(@Query('modelId') modelId?: string) {
    const versions = await this.listVersionsHandler.execute(modelId);
    return versions;
  }

  @Get('vehicle-versions/:id')
  @UseGuards(PermissionsGuard)
  @Permissions('admin.vehicle-catalog.versions.read')
  async getVersion(@Param('id') id: string) {
    return this.getVersionHandler.execute(id);
  }

  @Post('vehicle-versions')
  @UseGuards(PermissionsGuard)
  @Permissions('admin.vehicle-catalog.versions.create')
  async createVersion(@Body() dto: CreateVersionDto) {
    return this.createVersionHandler.execute(new CreateVersionCommand(dto));
  }

  @Patch('vehicle-versions/:id')
  @UseGuards(PermissionsGuard)
  @Permissions('admin.vehicle-catalog.versions.update')
  async updateVersion(@Param('id') id: string, @Body() dto: UpdateVersionDto) {
    return this.updateVersionHandler.execute(new UpdateVersionCommand(id, dto));
  }

  @Delete('vehicle-versions/:id')
  @UseGuards(PermissionsGuard)
  @Permissions('admin.vehicle-catalog.versions.delete')
  async deleteVersion(@Param('id') id: string) {
    await this.deleteVersionHandler.execute(new DeleteVersionCommand(id));
  }
}
