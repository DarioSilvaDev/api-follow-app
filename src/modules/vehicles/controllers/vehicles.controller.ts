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
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { DealershipOnlyGuard } from '../../../common/guards/dealership-only.guard';
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
import { GenerateTakeQrDto } from '../dto/generate-take-qr.dto';
import { GenerateConsignmentQrCommand } from '../commands/generate-consignment-qr/generate-consignment-qr.command';
import { GenerateConsignmentQrHandler } from '../commands/generate-consignment-qr/generate-consignment-qr.handler';
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
import { CorrectVinCommand } from '../commands/correct-vin/correct-vin.command';
import { CorrectVinHandler } from '../commands/correct-vin/correct-vin.handler';
import { CorrectVinDto } from '../dto/correct-vin.dto';
import { StorageR2Service } from '../../../common/storage/storage-r2.service';
import { envs } from '../../../config/envs';
import {
  ALLOWED_IMAGE_MIMES,
  ALLOWED_DOCUMENT_MIMES,
  fileTypeFilter,
} from './file-upload.utils';
import { VEHICLE_DOCUMENT_TYPE_CATALOG } from '../constants/vehicle-document-types';

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
    private readonly generateConsignmentQrHandler: GenerateConsignmentQrHandler,
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
    private readonly correctVinHandler: CorrectVinHandler,
    private readonly storage: StorageR2Service,
  ) {}

  /**
   * Strict-mode vehicle access check for /vehicles/* routes.
   * Ownership / VehicleAccess / DEALERSHIP titular (FIX-B1) / super_admin —
   * no workshop membership.
   */
  private assertVehicleAccess(
    vehicleId: string,
    user: AuthenticatedUser,
    context?: CurrentContext,
  ): Promise<void> {
    return this.vehicleAccessService.assertOwnershipOrSharedAccess({
      vehicleId,
      user,
      context,
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

  /**
   * D-133/D-149 (extensión a media — fotos/documentos): la concesionaria
   * TITULAR ACTIVA administra las fotos y documentos del vehículo en
   * exhibición con el MISMO permiso `dealership.vehicle.edit` que gobierna
   * el PATCH /:id (owner/admin/seller por igual). La escritura muere con la
   * transferencia (sin titularidad activa → fallback a assertVehicleOwned:
   * owner personal / super_admin; si tampoco autoriza, 403).
   */
  private async assertVehicleOwnedOrDealershipTitular(
    vehicleId: string,
    user: AuthenticatedUser,
    context?: CurrentContext,
  ): Promise<void> {
    if (context?.type === 'DEALERSHIP') {
      const allowed =
        await this.vehicleAccessService.assertDealershipVehicleWrite(
          vehicleId,
          user.id,
          context,
        );
      if (allowed) return;
    }
    await this.assertVehicleOwned(vehicleId, user);
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
   * En la misma transacción: QR consumed, ownership cerrada/creada,
   * VehicleTransfer completed + eventos (D-081).
   */
  @Post('transfer/qr/:token/accept')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @UseGuards(ThrottlerGuard)
  async acceptTransferQr(
    @Param('token') token: string,
    @Body() dto: AcceptTransferQrDto,
    @ActiveContext() ctx: CurrentContext,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.acceptTransferQrHandler.execute(
      new AcceptTransferQrCommand(token, user.id, dto, ctx),
    );
  }

  /**
   * QR de TRANSFERENCIA presencial (Fase 3, D-079..D-083).
   *
   * Fase 2b (B2): en contexto DEALERSHIP la concesionaria TITULAR genera el
   * QR de VENTA (`purpose: sale`; permiso `dealership.vehicle.sell`); en
   * contexto PERSONAL el owner genera el QR clásico (comportamiento D-079).
   *
   * D-10 (H-26): throttle por identidad para cubrir el alta de QR de venta.
   */
  @Post(':id/qr')
  @UseGuards(ThrottlerGuard)
  @Throttle({ dealershipVehicleCreate: { limit: 10, ttl: 3_600_000 } })
  async generateTransferQr(
    @Param('id') id: string,
    @Body() dto: GenerateTransferQrDto,
    @ActiveContext() ctx: CurrentContext,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (ctx.type === 'DEALERSHIP') {
      // D-TL-14 / spec §8: la concesionaria (titular) genera QR de venta.
      return this.generateConsignmentQrHandler.execute(
        new GenerateConsignmentQrCommand(id, user.id, 'sale', ctx),
      );
    }
    await this.assertVehicleOwned(id, user);
    return this.generateTransferQrHandler.execute(
      new GenerateTransferQrCommand(id, user.id, dto),
    );
  }

  /**
   * Fase 2b (D-104, RB-11): el vendedor (owner persona) genera el QR de TOMA.
   * Solo contexto PERSONAL; schedule `immediate | pickup` define el TTL.
   */
  @Post(':id/consignment/take-qr')
  async generateTakeQr(
    @Param('id') id: string,
    @Body() dto: GenerateTakeQrDto,
    @ActiveContext() ctx: CurrentContext,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (ctx.type !== 'PERSONAL') {
      throw new ForbiddenException(
        'El QR de toma debe generarse desde la cuenta personal del vendedor',
      );
    }
    await this.assertVehicleOwned(id, user);
    return this.generateConsignmentQrHandler.execute(
      new GenerateConsignmentQrCommand(id, user.id, 'take', ctx, dto.schedule),
    );
  }

  /**
   * Fase 2b (D-105, RB-11): la concesionaria TITULAR genera el QR inverso de
   * DEVOLUCIÓN. Guard estricto DEALERSHIP ANTES de PermissionsGuard (A2) y
   * permiso `dealership.vehicle.return` (RB-10). Sin fallback de params.id.
   */
  @Post(':id/consignment/return-qr')
  @UseGuards(DealershipOnlyGuard, PermissionsGuard)
  @Permissions('dealership.vehicle.return')
  async generateReturnQr(
    @Param('id') id: string,
    @ActiveContext() ctx: CurrentContext,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.generateConsignmentQrHandler.execute(
      new GenerateConsignmentQrCommand(id, user.id, 'return', ctx),
    );
  }

  /**
   * Revocación del QR pendiente. Rama DEALERSHIP (B2): la concesionaria
   * titular revoca sus QRs de consignación (permiso vehicle.sell/return).
   */
  @Delete(':id/qr')
  async revokeTransferQr(
    @Param('id') id: string,
    @ActiveContext() ctx: CurrentContext,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (ctx.type === 'DEALERSHIP') {
      return this.revokeTransferQrHandler.execute(
        new RevokeTransferQrCommand(id, user.id, ctx),
      );
    }
    // D-079: solo el owner puede revocar.
    await this.assertVehicleOwned(id, user);
    return this.revokeTransferQrHandler.execute(
      new RevokeTransferQrCommand(id, user.id, ctx),
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
    @ActiveContext() ctx: CurrentContext,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    // D-048 (F-013): writes are owner-only in MVP; shared access is read-only.
    // D-133/D-149: la concesionaria titular administra la media (ver helper).
    await this.assertVehicleOwnedOrDealershipTitular(id, user, ctx);
    const photo = await this.uploadPhotoHandler.execute(
      new UploadPhotoCommand(id, file, user.id),
    );
    return PhotoResponseDto.from(photo);
  }

  @Get(':id/photos')
  async listPhotos(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @ActiveContext() ctx: CurrentContext,
    @Query('signed') signed?: string,
  ) {
    // FIX-B1 + Gap: el contexto se reenvía para que la rama DEALERSHIP (RB-04)
    // habilite la lectura de la concesionaria titular (antes 403 en exhibición).
    await this.assertVehicleAccess(id, user, ctx);
    const photos = await this.listPhotosHandler.execute(id);
    if (signed === 'true') {
      return Promise.all(
        photos.map(async (p) => ({
          ...PhotoResponseDto.from(p),
          url: await this.storage.getSignedUrl(p.key),
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
    @ActiveContext() ctx: CurrentContext,
    @Query('signed') signed?: string,
  ) {
    // FIX-B1 + Gap: lectura con contexto (misma regla que listPhotos).
    await this.assertVehicleAccess(vehicleId, user, ctx);
    const photo = await this.getPhotoHandler.execute(vehicleId, photoId);
    if (signed === 'true') {
      const url = await this.storage.getSignedUrl(photo.key);
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
    @ActiveContext() ctx: CurrentContext,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    // D-048: writes are owner-only; shared access is read-only.
    // D-133/D-149: la concesionaria titular administra la media (ver helper).
    await this.assertVehicleOwnedOrDealershipTitular(id, user, ctx);
    return this.setPrimaryPhotoHandler.execute(
      new SetPrimaryPhotoCommand(id, photoId),
    );
  }

  @Delete(':id/photos/:photoId')
  async deletePhoto(
    @Param('id') id: string,
    @Param('photoId') photoId: string,
    @ActiveContext() ctx: CurrentContext,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    // D-048: writes are owner-only; shared access is read-only.
    // D-133/D-149: la concesionaria titular administra la media (ver helper).
    await this.assertVehicleOwnedOrDealershipTitular(id, user, ctx);
    await this.deletePhotoHandler.execute(new DeletePhotoCommand(id, photoId));
  }

  /**
   * Catálogo estático de tipos de documento vehicular (solo VTV por ahora).
   * Sirve al dropdown del frontend y define el vocabulario de
   * `documentType`. Cualquier sesión autenticada puede consultarlo
   * (JwtAuthGuard de clase); no requiere contexto activo específico ni
   * acceso al vehículo. Ver constants/vehicle-document-types.ts.
   */
  @Get('documents/types')
  getDocumentTypes() {
    return VEHICLE_DOCUMENT_TYPE_CATALOG;
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
    @ActiveContext() ctx: CurrentContext,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    // D-048: writes are owner-only; shared access is read-only.
    // D-133/D-149: la concesionaria titular administra la media (ver helper).
    await this.assertVehicleOwnedOrDealershipTitular(id, user, ctx);
    const doc = await this.uploadDocumentHandler.execute(
      new UploadDocumentCommand(id, dto, file, user.id),
    );
    return DocumentResponseDto.from(doc);
  }

  @Get(':id/documents')
  async listDocuments(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @ActiveContext() ctx: CurrentContext,
    @Query('signed') signed?: string,
  ) {
    // FIX-B1 + Gap: lectura con contexto (misma regla que listPhotos).
    await this.assertVehicleAccess(id, user, ctx);
    const docs = await this.listDocumentsHandler.execute(id);
    if (signed === 'true') {
      return Promise.all(
        docs.map(async (d) => ({
          ...DocumentResponseDto.from(d),
          url: await this.storage.getSignedUrl(d.key),
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
    @ActiveContext() ctx: CurrentContext,
    @Query('signed') signed?: string,
  ) {
    // FIX-B1 + Gap: lectura con contexto (misma regla que listPhotos).
    await this.assertVehicleAccess(vehicleId, user, ctx);
    const doc = await this.getDocumentHandler.execute(vehicleId, docId);
    if (signed === 'true') {
      const url = await this.storage.getSignedUrl(doc.key);
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
    @ActiveContext() ctx: CurrentContext,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    // D-048: writes are owner-only; shared access is read-only.
    // D-133/D-149: la concesionaria titular administra la media (ver helper).
    await this.assertVehicleOwnedOrDealershipTitular(id, user, ctx);
    return this.updateDocumentHandler.execute(
      new UpdateDocumentCommand(id, docId, dto),
    );
  }

  @Delete(':id/documents/:docId')
  async deleteDocument(
    @Param('id') id: string,
    @Param('docId') docId: string,
    @ActiveContext() ctx: CurrentContext,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    // D-048: writes are owner-only; shared access is read-only.
    // D-133/D-149: la concesionaria titular administra la media (ver helper).
    await this.assertVehicleOwnedOrDealershipTitular(id, user, ctx);
    await this.deleteDocumentHandler.execute(
      new DeleteDocumentCommand(id, docId),
    );
  }

  @Post()
  // D-10: alta de vehículo limitada a 10/hora por identidad (bucket propio).
  @UseGuards(ThrottlerGuard)
  @Throttle({ dealershipVehicleCreate: { limit: 10, ttl: 3_600_000 } })
  async create(
    @Body() dto: RegisterVehicleDto,
    @ActiveContext() ctx: CurrentContext,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const vehicle = await this.registerVehicleHandler.execute(
      new RegisterVehicleCommand(dto, user.id, ctx),
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
      // D-TL-19: el contexto activo se reenvía al handler para que la rama
      // DEALERSHIP liste los vehículos de la concesionaria (mismo contrato).
      context: ctx,
      page,
      limit,
      q,
    });
  }

  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @ActiveContext() ctx: CurrentContext,
  ) {
    // FIX-B1: el contexto DEALERSHIP habilita la lectura de la concesionaria
    // titular (RB-04) en el detalle del vehículo en exhibición.
    await this.assertVehicleAccess(id, user, ctx);
    // FIX-PII (§34): el caller se pasa al handler para aplicar la misma regla
    // de exposición de emails que el history (owner persona + super_admin).
    // Gap 1 — D-12: el contexto se pasa para calcular `capabilities`.
    const vehicle = await this.getVehicleHandler.execute(id, user, ctx);
    return VehicleResponseDto.from(vehicle);
  }


  /**
   * D-154 (Security M4): el 409 de "VIN ya existe" es un oráculo distinguible;
   * se limita el endpoint con el mismo bucket por identidad que el alta
   * (D-10 / D-154). ThrottlerGuard se declara a nivel de método, por lo que
   * corre DESPUÉS de JwtAuthGuard (clase) y `req.user` ya existe (R-04).
   */
  @Post(':id/vin-correction')
  @UseGuards(ThrottlerGuard)
  @Throttle({ dealershipVehicleCreate: { limit: 10, ttl: 3_600_000 } })
  async correctVin(
    @Param('id') id: string,
    @Body() dto: CorrectVinDto,
    @ActiveContext() ctx: CurrentContext,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const vehicle = await this.correctVinHandler.execute(
      new CorrectVinCommand(id, dto, user.id, ctx),
    );
    // D-11: no exponer el modelo Prisma crudo (FKs internas de ownerships);
    // mismo mapeo que GET /vehicles/:id.
    return VehicleResponseDto.from(vehicle);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateVehicleDto,
    @ActiveContext() ctx: CurrentContext,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (ctx.type === 'DEALERSHIP') {
      // D-133/D-149: la concesionaria TITULAR ACTIVA edita los campos editables
      // del PATCH (owner/admin/seller por igual, permiso
      // `dealership.vehicle.edit`). La escritura muere con la transferencia.
      // Si no hay titularidad de concesionaria, se evalúa el ownership personal
      // / super_admin vía assertVehicleOwned como fallback; si tampoco autoriza,
      // ese check lanza 403. El `vin` sigue rechazándose por DTO (`@IsEmpty()`);
      // su corrección es un flujo auditado aparte (D-143/D-144).
      const allowed =
        await this.vehicleAccessService.assertDealershipVehicleWrite(
          id,
          user.id,
          ctx,
        );
      if (!allowed) {
        // Regresión corregida: un super_admin (o un owner personal) actuando en
        // contexto DEALERSHIP debe seguir autorizado aunque no sea titular de la
        // concesionaria. assertVehicleOwned permite owner personal y super_admin;
        // si tampoco autoriza, lanza 403 (fallo cerrado).
        await this.assertVehicleOwned(id, user);
      }
    } else {
      // D-039: PERSONAL (y demás contextos) solo el owner puede editar (el
      // acceso compartido es solo lectura). Mismo criterio que
      // delete/grant-access (assertVehicleOwned).
      await this.assertVehicleOwned(id, user);
    }
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
  // D-154 (Security M4): el 409 de monotonía de km es un oráculo distinguible;
  // mismo bucket por identidad que el alta (D-10). Guard de método: corre
  // después de JwtAuthGuard (clase) para que `req.user` exista (R-04).
  @UseGuards(ThrottlerGuard)
  @Throttle({ dealershipVehicleCreate: { limit: 10, ttl: 3_600_000 } })
  async recordMileage(
    @Param('id') id: string,
    @Body() dto: RecordMileageDto,
    @ActiveContext() ctx: CurrentContext,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    // Gap 1 (§4.3 / D-05): la autorización vive en el handler (fallo cerrado
    // por contexto y por tipo de vehículo). Ya NO es solo-owner: en DEALERSHIP
    // la concesionaria titular puede registrar km con el permiso correspondiente.
    return this.recordMileageHandler.execute(
      new RecordMileageCommand(id, dto, user.id, ctx),
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
    @ActiveContext() ctx: CurrentContext,
  ) {
    // FIX-B1: la concesionaria titular puede ver el historial del vehículo en
    // exhibición (RB-04) — el timeline ya modela los tramos fromDealership/
    // toDealership (B3) sin PII de empleados (RB-08).
    await this.assertVehicleAccess(id, user, ctx);
    return this.getVehicleHistoryHandler.execute(id, user);
  }
}



