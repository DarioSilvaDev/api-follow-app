import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../../common/types/auth.types';
import { JwtAuthGuard } from '../../auth/strategies/jwt-auth.guard';
import { ContextGuard } from '../../../common/context/guards/context.guard';
import { ActiveContext } from '../../../common/context/decorators/current-context.decorator';
import type { CurrentContext } from '../../../common/context/interfaces/current-context.interface';
import { VehicleAccessService } from '../../../common/authorization/vehicle-access.service';
import { RegisterVehicleDto } from '../dto/register-vehicle.dto';
import { UpdateVehicleDto } from '../dto/update-vehicle.dto';
import { TransferVehicleDto } from '../dto/transfer-vehicle.dto';
import { RecordMileageDto } from '../dto/record-mileage.dto';
import { GrantAccessDto } from '../dto/grant-access.dto';
import { UploadDocumentDto } from '../dto/upload-document.dto';
import { UpdateDocumentDto } from '../dto/update-document.dto';
import { VehicleResponseDto } from '../dto/vehicle-response.dto';
import { PhotoResponseDto } from '../dto/photo-response.dto';
import { DocumentResponseDto } from '../dto/document-response.dto';
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
import { GetIncomingTransfersHandler } from '../queries/get-incoming-transfers/get-incoming-transfers.handler';
import { GetOutgoingTransfersHandler } from '../queries/get-outgoing-transfers/get-outgoing-transfers.handler';
import { AcceptTransferCommand } from '../commands/accept-transfer/accept-transfer.command';
import { AcceptTransferHandler } from '../commands/accept-transfer/accept-transfer.handler';
import { RejectTransferCommand } from '../commands/reject-transfer/reject-transfer.command';
import { RejectTransferHandler } from '../commands/reject-transfer/reject-transfer.handler';
import { CancelTransferCommand } from '../commands/cancel-transfer/cancel-transfer.command';
import { CancelTransferHandler } from '../commands/cancel-transfer/cancel-transfer.handler';
import { GenerateTransferQrCommand } from '../commands/generate-transfer-qr/generate-transfer-qr.command';
import { GenerateTransferQrHandler } from '../commands/generate-transfer-qr/generate-transfer-qr.handler';
import { GenerateTransferQrDto } from '../dto/generate-transfer-qr.dto';
import { PreviewTransferQrCommand } from '../commands/preview-transfer-qr/preview-transfer-qr.command';
import { PreviewTransferQrHandler } from '../commands/preview-transfer-qr/preview-transfer-qr.handler';
import { AcceptTransferQrCommand } from '../commands/accept-transfer-qr/accept-transfer-qr.command';
import { AcceptTransferQrHandler } from '../commands/accept-transfer-qr/accept-transfer-qr.handler';
import { AcceptTransferQrDto } from '../dto/accept-transfer-qr.dto';
import { RevokeTransferQrCommand } from '../commands/revoke-transfer-qr/revoke-transfer-qr.command';
import { RevokeTransferQrHandler } from '../commands/revoke-transfer-qr/revoke-transfer-qr.handler';
import { UploadPhotoCommand } from '../commands/upload-photo/upload-photo.command';
import { UploadPhotoHandler } from '../commands/upload-photo/upload-photo.handler';
import { SetPrimaryPhotoCommand } from '../commands/set-primary-photo/set-primary-photo.command';
import { SetPrimaryPhotoHandler } from '../commands/set-primary-photo/set-primary-photo.handler';
import { DeletePhotoCommand } from '../commands/delete-photo/delete-photo.command';
import { DeletePhotoHandler } from '../commands/delete-photo/delete-photo.handler';
import { ListPhotosHandler } from '../queries/list-photos/list-photos.handler';
import { GetPhotoHandler } from '../queries/get-photo/get-photo.handler';
import { UploadDocumentCommand } from '../commands/upload-document/upload-document.command';
import { UploadDocumentHandler } from '../commands/upload-document/upload-document.handler';
import { UpdateDocumentCommand } from '../commands/update-document/update-document.command';
import { UpdateDocumentHandler } from '../commands/update-document/update-document.handler';
import { DeleteDocumentCommand } from '../commands/delete-document/delete-document.command';
import { DeleteDocumentHandler } from '../commands/delete-document/delete-document.handler';
import { ListDocumentsHandler } from '../queries/list-documents/list-documents.handler';
import { GetDocumentHandler } from '../queries/get-document/get-document.handler';
import { StorageR2Service } from '../../../common/storage/storage-r2.service';
import { envs } from '../../../config/envs';
import {
  ALLOWED_IMAGE_MIMES,
  ALLOWED_DOCUMENT_MIMES,
  fileTypeFilter,
} from './file-upload.utils';

/**
 * Allowed MIME types and filter — see ./file-upload.utils.ts
 */

@Controller('vehicles')
@UseGuards(JwtAuthGuard, ContextGuard)
export class VehiclesController {
  constructor(
    private readonly vehicleAccessService: VehicleAccessService,
    private readonly registerVehicleHandler: RegisterVehicleHandler,
    private readonly updateVehicleHandler: UpdateVehicleHandler,
    private readonly deleteVehicleHandler: DeleteVehicleHandler,
    private readonly transferVehicleHandler: TransferVehicleHandler,
    private readonly recordMileageHandler: RecordMileageHandler,
    private readonly grantAccessHandler: GrantAccessHandler,
    private readonly getVehicleHandler: GetVehicleHandler,
    private readonly listVehiclesHandler: ListVehiclesHandler,
    private readonly getVehicleHistoryHandler: GetVehicleHistoryHandler,
    private readonly getIncomingTransfersHandler: GetIncomingTransfersHandler,
    private readonly getOutgoingTransfersHandler: GetOutgoingTransfersHandler,
    private readonly acceptTransferHandler: AcceptTransferHandler,
    private readonly rejectTransferHandler: RejectTransferHandler,
private readonly cancelTransferHandler: CancelTransferHandler,
  private readonly generateTransferQrHandler: GenerateTransferQrHandler,
  private readonly previewTransferQrHandler: PreviewTransferQrHandler,
  private readonly acceptTransferQrHandler: AcceptTransferQrHandler,
  private readonly revokeTransferQrHandler: RevokeTransferQrHandler,
  private readonly uploadPhotoHandler: UploadPhotoHandler,
    private readonly setPrimaryPhotoHandler: SetPrimaryPhotoHandler,
    private readonly deletePhotoHandler: DeletePhotoHandler,
    private readonly listPhotosHandler: ListPhotosHandler,
    private readonly getPhotoHandler: GetPhotoHandler,
    private readonly uploadDocumentHandler: UploadDocumentHandler,
    private readonly updateDocumentHandler: UpdateDocumentHandler,
    private readonly deleteDocumentHandler: DeleteDocumentHandler,
    private readonly listDocumentsHandler: ListDocumentsHandler,
    private readonly getDocumentHandler: GetDocumentHandler,
    private readonly storage: StorageR2Service,
  ) {}

  /**
   * Strict-mode vehicle access check for /vehicles/* routes.
   * Ownership / VehicleAccess / super_admin only — no workshop membership.
   */
  private assertVehicleAccess(
    vehicleId: string,
    user: AuthenticatedUser,
  ): Promise<void> {
    return this.vehicleAccessService.assertOwnershipOrSharedAccess({
      vehicleId,
      user,
    });
  }

  /**
   * Ownership-only check (Security Review #8 — P1) for privileged vehicle
   * operations (grant access, delete, transfer): shared-access holders must
   * NOT be able to perform them. Accepts active ownership or super_admin.
   */
  private assertVehicleOwned(
    vehicleId: string,
    user: AuthenticatedUser,
  ): Promise<void> {
    return this.vehicleAccessService.assertOwnership({ vehicleId, user });
  }

  @Get('transfers/incoming')
  async getIncomingTransfers(@CurrentUser() user: AuthenticatedUser) {
    return this.getIncomingTransfersHandler.execute(user.id);
  }

  @Get('transfers/outgoing')
  async getOutgoingTransfers(@CurrentUser() user: AuthenticatedUser) {
    return this.getOutgoingTransfersHandler.execute(user.id);
  }

  @Patch('transfers/:id/accept')
  async acceptTransfer(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.acceptTransferHandler.execute(
      new AcceptTransferCommand(id, user.id),
    );
  }

  @Patch('transfers/:id/reject')
  async rejectTransfer(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.rejectTransferHandler.execute(
      new RejectTransferCommand(id, user.id),
    );
  }

  @Patch('transfers/:id/cancel')
  async cancelTransfer(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.cancelTransferHandler.execute(
      new CancelTransferCommand(id, user.id),
    );
  }

  /**
   * QR de transferencia presencial (Fase 3, D-079..D-083).
   * GET: preview del QR (vehicle + emisor) — no requiere ser owner (el
   * receptor debe poder consultarlo antes de aceptar).
   */
  @Get('transfer/qr/:token')
  // Wave P3: brute-force protection on the 32-hex QR token.
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @UseGuards(ThrottlerGuard)
  async previewTransferQr(
    @Param('token') token: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.previewTransferQrHandler.execute(
      new PreviewTransferQrCommand(token),
    );
  }

  /**
   * En la misma transacción: QR consumed, ownership cerrada/creada,
   * VehicleTransfer completed + eventos (D-081).
   */
  @Post('transfer/qr/:token/accept')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @UseGuards(ThrottlerGuard)
  async acceptTransferQr(
    @Param('token') token: string,
    @Body() dto: AcceptTransferQrDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.acceptTransferQrHandler.execute(
      new AcceptTransferQrCommand(token, user.id, dto),
    );
  }

  @Post(':id/qr')
  async generateTransferQr(
    @Param('id') id: string,
    @Body() dto: GenerateTransferQrDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    // D-079: solo el owner puede generar/revocar QR.
    await this.assertVehicleOwned(id, user);
    return this.generateTransferQrHandler.execute(
      new GenerateTransferQrCommand(id, user.id, dto),
    );
  }

  @Delete(':id/qr')
  async revokeTransferQr(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    // D-079: solo el owner puede revocar.
    await this.assertVehicleOwned(id, user);
    return this.revokeTransferQrHandler.execute(
      new RevokeTransferQrCommand(id, user.id),
    );
  }

  @Post(':id/photos')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter: fileTypeFilter(ALLOWED_IMAGE_MIMES),
    }),
  )
  async uploadPhoto(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    // D-048 (F-013): writes are owner-only in MVP; shared access is read-only.
    await this.assertVehicleOwned(id, user);
    const photo = await this.uploadPhotoHandler.execute(
      new UploadPhotoCommand(id, file, user.id),
    );
    return PhotoResponseDto.from(photo);
  }

  @Get(':id/photos')
  async listPhotos(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query('signed') signed?: string,
  ) {
    await this.assertVehicleAccess(id, user);
    const photos = await this.listPhotosHandler.execute(id);
    if (signed === 'true') {
      return Promise.all(
        photos.map(async (p) => ({
          ...PhotoResponseDto.from(p),
          url: await this.storage.getSignedUrl!(p.key),
          expiresAt: new Date(
            Date.now() + envs.SIGNED_URL_EXPIRES_SECONDS * 1000,
          ),
        })),
      );
    }
    return photos.map((p) => PhotoResponseDto.from(p));
  }

  @Get(':id/photos/:photoId')
  async getPhoto(
    @Param('id') vehicleId: string,
    @Param('photoId') photoId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query('signed') signed?: string,
  ) {
    await this.assertVehicleAccess(vehicleId, user);
    const photo = await this.getPhotoHandler.execute(vehicleId, photoId);
    if (signed === 'true') {
      const url = await this.storage.getSignedUrl!(photo.key);
      return {
        url,
        expiresAt: new Date(
          Date.now() + envs.SIGNED_URL_EXPIRES_SECONDS * 1000,
        ),
      };
    }
    return PhotoResponseDto.from(photo);
  }

  @Patch(':id/photos/:photoId/primary')
  async setPrimaryPhoto(
    @Param('id') id: string,
    @Param('photoId') photoId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    // D-048: writes are owner-only; shared access is read-only.
    await this.assertVehicleOwned(id, user);
    return this.setPrimaryPhotoHandler.execute(
      new SetPrimaryPhotoCommand(id, photoId),
    );
  }

  @Delete(':id/photos/:photoId')
  async deletePhoto(
    @Param('id') id: string,
    @Param('photoId') photoId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    // D-048: writes are owner-only; shared access is read-only.
    await this.assertVehicleOwned(id, user);
    await this.deletePhotoHandler.execute(new DeletePhotoCommand(id, photoId));
  }

  @Post(':id/documents')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter: fileTypeFilter(ALLOWED_DOCUMENT_MIMES),
    }),
  )
  async uploadDocument(
    @Param('id') id: string,
    @Body() dto: UploadDocumentDto,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    // D-048: writes are owner-only; shared access is read-only.
    await this.assertVehicleOwned(id, user);
    const doc = await this.uploadDocumentHandler.execute(
      new UploadDocumentCommand(id, dto, file, user.id),
    );
    return DocumentResponseDto.from(doc);
  }

  @Get(':id/documents')
  async listDocuments(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query('signed') signed?: string,
  ) {
    await this.assertVehicleAccess(id, user);
    const docs = await this.listDocumentsHandler.execute(id);
    if (signed === 'true') {
      return Promise.all(
        docs.map(async (d) => ({
          ...DocumentResponseDto.from(d),
          url: await this.storage.getSignedUrl!(d.key),
          urlExpiresAt: new Date(
            Date.now() + envs.SIGNED_URL_EXPIRES_SECONDS * 1000,
          ),
        })),
      );
    }
    return docs.map((d) => DocumentResponseDto.from(d));
  }

  @Get(':id/documents/:docId')
  async getDocument(
    @Param('id') vehicleId: string,
    @Param('docId') docId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query('signed') signed?: string,
  ) {
    await this.assertVehicleAccess(vehicleId, user);
    const doc = await this.getDocumentHandler.execute(vehicleId, docId);
    if (signed === 'true') {
      const url = await this.storage.getSignedUrl!(doc.key);
      return {
        url,
        expiresAt: new Date(
          Date.now() + envs.SIGNED_URL_EXPIRES_SECONDS * 1000,
        ),
      };
    }
    return DocumentResponseDto.from(doc);
  }

  @Patch(':id/documents/:docId')
  async updateDocument(
    @Param('id') id: string,
    @Param('docId') docId: string,
    @Body() dto: UpdateDocumentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    // D-048: writes are owner-only; shared access is read-only.
    await this.assertVehicleOwned(id, user);
    return this.updateDocumentHandler.execute(
      new UpdateDocumentCommand(id, docId, dto),
    );
  }

  @Delete(':id/documents/:docId')
  async deleteDocument(
    @Param('id') id: string,
    @Param('docId') docId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    // D-048: writes are owner-only; shared access is read-only.
    await this.assertVehicleOwned(id, user);
    await this.deleteDocumentHandler.execute(
      new DeleteDocumentCommand(id, docId),
    );
  }

  @Post()
  async create(
    @Body() dto: RegisterVehicleDto,
    @ActiveContext() ctx: CurrentContext,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const vehicle = await this.registerVehicleHandler.execute(
      new RegisterVehicleCommand(dto, user.id),
    );
    return VehicleResponseDto.from(vehicle);
  }

  @Get()
  async findAll(
    @ActiveContext() ctx: CurrentContext,
    @CurrentUser() user: AuthenticatedUser,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('q') q?: string,
  ) {
    return this.listVehiclesHandler.execute({
      userId: user.id,
      page,
      limit,
      q,
    });
  }

  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.assertVehicleAccess(id, user);
    const vehicle = await this.getVehicleHandler.execute(id);
    return VehicleResponseDto.from(vehicle);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateVehicleDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    // D-039: solo el owner puede editar en MVP (el acceso compartido es solo
    // lectura). Mismo criterio que delete/grant-access (assertVehicleOwned).
    await this.assertVehicleOwned(id, user);
    const vehicle = await this.updateVehicleHandler.execute(
      new UpdateVehicleCommand(id, dto),
    );
    // F-011: mismo patrón que create()/findOne() — VehicleResponseDto.from()
    // aplana la relación version.model.brand (brand/model/version) y evita
    // responder raw Prisma en el 200.
    return VehicleResponseDto.from(vehicle);
  }

  @Delete(':id')
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.assertVehicleOwned(id, user);
    await this.deleteVehicleHandler.execute(new DeleteVehicleCommand(id));
  }

  @Post(':id/transfer')
  async transfer(
    @Param('id') id: string,
    @Body() dto: TransferVehicleDto,
    @ActiveContext() ctx: CurrentContext,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.transferVehicleHandler.execute(
      new TransferVehicleCommand(id, dto, user.id),
    );
  }

  @Post(':id/mileage')
  async recordMileage(
    @Param('id') id: string,
    @Body() dto: RecordMileageDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    // D-048: writes are owner-only; shared access is read-only.
    await this.assertVehicleOwned(id, user);
    return this.recordMileageHandler.execute(
      new RecordMileageCommand(id, dto, user.id),
    );
  }

  @Post(':id/access')
  async grantAccess(
    @Param('id') id: string,
    @Body() dto: GrantAccessDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.assertVehicleOwned(id, user);
    return this.grantAccessHandler.execute(
      new GrantAccessCommand(id, dto, user.id),
    );
  }

  @Get(':id/history')
  async getHistory(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.assertVehicleAccess(id, user);
    return this.getVehicleHistoryHandler.execute(id, user);
  }
}
