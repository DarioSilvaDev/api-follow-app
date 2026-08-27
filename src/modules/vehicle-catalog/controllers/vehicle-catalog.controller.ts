import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/strategies/jwt-auth.guard';
import { ListBrandsHandler } from '../queries/list-brands.handler';
import { GetBrandHandler } from '../queries/get-brand.handler';
import { ListModelsHandler } from '../queries/list-models.handler';
import { GetModelHandler } from '../queries/get-model.handler';
import { ListVersionsHandler } from '../queries/list-versions.handler';
import { GetVersionHandler } from '../queries/get-version.handler';

@Controller()
@UseGuards(JwtAuthGuard)
export class VehicleCatalogController {
  constructor(
    private readonly listBrandsHandler: ListBrandsHandler,
    private readonly getBrandHandler: GetBrandHandler,
    private readonly listModelsHandler: ListModelsHandler,
    private readonly getModelHandler: GetModelHandler,
    private readonly listVersionsHandler: ListVersionsHandler,
    private readonly getVersionHandler: GetVersionHandler,
  ) {}

  @Get('vehicle-brands')
  async listBrands() {
    const brands = await this.listBrandsHandler.execute();
    return brands;
  }

  @Get('vehicle-brands/:id')
  async getBrand(@Param('id') id: string) {
    return this.getBrandHandler.execute(id);
  }

  @Get('vehicle-models')
  async listModels(@Query('brandId') brandId?: string) {
    const models = await this.listModelsHandler.execute(brandId);
    return models;
  }

  @Get('vehicle-models/:id')
  async getModel(@Param('id') id: string) {
    return this.getModelHandler.execute(id);
  }

  @Get('vehicle-versions')
  async listVersions(@Query('modelId') modelId?: string) {
    const versions = await this.listVersionsHandler.execute(modelId);
    return versions;
  }

  @Get('vehicle-versions/:id')
  async getVersion(@Param('id') id: string) {
    return this.getVersionHandler.execute(id);
  }
}
