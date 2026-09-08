import { Module } from '@nestjs/common';
import { VehiclesController } from './controllers/vehicles.controller';
import { PrismaVehicleRepository } from './repositories/prisma-vehicle.repository';
import { VEHICLE_REPOSITORY } from './tokens';
import { AuthorizationModule } from '../../common/authorization.module';
import { RegisterVehicleHandler } from './commands/register-vehicle/register-vehicle.handler';
import { UpdateVehicleHandler } from './commands/update-vehicle/update-vehicle.handler';
import { DeleteVehicleHandler } from './commands/delete-vehicle/delete-vehicle.handler';
import { TransferVehicleHandler } from './commands/transfer-vehicle/transfer-vehicle.handler';
import { RecordMileageHandler } from './commands/record-mileage/record-mileage.handler';
import { GrantAccessHandler } from './commands/grant-access/grant-access.handler';
import { GetVehicleHandler } from './queries/get-vehicle/get-vehicle.handler';
import { ListVehiclesHandler } from './queries/list-vehicles/list-vehicles.handler';
import { GetVehicleHistoryHandler } from './queries/get-vehicle-history/get-vehicle-history.handler';
import { GetIncomingTransfersHandler } from './queries/get-incoming-transfers/get-incoming-transfers.handler';
import { GetOutgoingTransfersHandler } from './queries/get-outgoing-transfers/get-outgoing-transfers.handler';
import { AcceptTransferHandler } from './commands/accept-transfer/accept-transfer.handler';
import { RejectTransferHandler } from './commands/reject-transfer/reject-transfer.handler';
import { CancelTransferHandler } from './commands/cancel-transfer/cancel-transfer.handler';
import { TransferRequestEmailListener } from './listeners/transfer-request-email.listener';
import { TransferAcceptedEmailListener } from './listeners/transfer-accepted-email.listener';
import { UploadPhotoHandler } from './commands/upload-photo/upload-photo.handler';
import { SetPrimaryPhotoHandler } from './commands/set-primary-photo/set-primary-photo.handler';
import { DeletePhotoHandler } from './commands/delete-photo/delete-photo.handler';
import { ListPhotosHandler } from './queries/list-photos/list-photos.handler';
import { UploadDocumentHandler } from './commands/upload-document/upload-document.handler';
import { UpdateDocumentHandler } from './commands/update-document/update-document.handler';
import { DeleteDocumentHandler } from './commands/delete-document/delete-document.handler';
import { ListDocumentsHandler } from './queries/list-documents/list-documents.handler';
import { GetPhotoHandler } from './queries/get-photo/get-photo.handler';
import { GetDocumentHandler } from './queries/get-document/get-document.handler';

@Module({
  imports: [AuthorizationModule],
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
    GetPhotoHandler,
    GetDocumentHandler,
    GetIncomingTransfersHandler,
    GetOutgoingTransfersHandler,
    AcceptTransferHandler,
    RejectTransferHandler,
    CancelTransferHandler,
    UploadPhotoHandler,
    SetPrimaryPhotoHandler,
    DeletePhotoHandler,
    ListPhotosHandler,
    UploadDocumentHandler,
    UpdateDocumentHandler,
    DeleteDocumentHandler,
    ListDocumentsHandler,
    TransferRequestEmailListener,
    TransferAcceptedEmailListener,
    { provide: VEHICLE_REPOSITORY, useClass: PrismaVehicleRepository },
  ],
  exports: [VEHICLE_REPOSITORY],
})
export class VehiclesModule {}
