import { Module } from '@nestjs/common';
import { AuthorizationModule } from '../../common/authorization.module';
import { VehicleCatalogController } from './controllers/vehicle-catalog.controller';
import { AdminVehicleCatalogController } from './controllers/admin-vehicle-catalog.controller';
import { CreateBrandHandler } from './commands/create-brand/create-brand.handler';
import { UpdateBrandHandler } from './commands/update-brand/update-brand.handler';
import { DeleteBrandHandler } from './commands/delete-brand/delete-brand.handler';
import { CreateModelHandler } from './commands/create-model/create-model.handler';
import { UpdateModelHandler } from './commands/update-model/update-model.handler';
import { DeleteModelHandler } from './commands/delete-model/delete-model.handler';
import { CreateVersionHandler } from './commands/create-version/create-version.handler';
import { UpdateVersionHandler } from './commands/update-version/update-version.handler';
import { DeleteVersionHandler } from './commands/delete-version/delete-version.handler';
import { ListBrandsHandler } from './queries/list-brands.handler';
import { GetBrandHandler } from './queries/get-brand.handler';
import { ListModelsHandler } from './queries/list-models.handler';
import { GetModelHandler } from './queries/get-model.handler';
import { ListVersionsHandler } from './queries/list-versions.handler';
import { GetVersionHandler } from './queries/get-version.handler';

@Module({
  imports: [AuthorizationModule],
  controllers: [VehicleCatalogController, AdminVehicleCatalogController],
  providers: [
    CreateBrandHandler,
    UpdateBrandHandler,
    DeleteBrandHandler,
    CreateModelHandler,
    UpdateModelHandler,
    DeleteModelHandler,
    CreateVersionHandler,
    UpdateVersionHandler,
    DeleteVersionHandler,
    ListBrandsHandler,
    GetBrandHandler,
    ListModelsHandler,
    GetModelHandler,
    ListVersionsHandler,
    GetVersionHandler,
  ],
})
export class VehicleCatalogModule {}
