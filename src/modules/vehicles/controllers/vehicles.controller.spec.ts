import { ForbiddenException } from '@nestjs/common';

// Mock uuid (ESM module) before importing anything that transitively loads StorageR2Service
jest.mock('uuid', () => ({ v4: () => 'test-uuid' }));

import { VehiclesController } from './vehicles.controller';
import { VehicleAccessService } from '../../../common/authorization/vehicle-access.service';
import { PhotoResponseDto } from '../dto/photo-response.dto';
import { DocumentResponseDto } from '../dto/document-response.dto';
import { AuthenticatedUser } from '../../../common/types/auth.types';
import { CurrentContext } from '../../../common/context/interfaces/current-context.interface';
import { UploadPhotoHandler } from '../commands/upload-photo/upload-photo.handler';
import { SetPrimaryPhotoHandler } from '../commands/set-primary-photo/set-primary-photo.handler';
import { DeletePhotoHandler } from '../commands/delete-photo/delete-photo.handler';
import { UploadDocumentHandler } from '../commands/upload-document/upload-document.handler';
import { UpdateDocumentHandler } from '../commands/update-document/update-document.handler';
import { DeleteDocumentHandler } from '../commands/delete-document/delete-document.handler';
import { RecordMileageHandler } from '../commands/record-mileage/record-mileage.handler';
import { ListPhotosHandler } from '../queries/list-photos/list-photos.handler';
import { ListDocumentsHandler } from '../queries/list-documents/list-documents.handler';
import { GetPhotoHandler } from '../queries/get-photo/get-photo.handler';
import { GetDocumentHandler } from '../queries/get-document/get-document.handler';
import { GetVehicleHandler } from '../queries/get-vehicle/get-vehicle.handler';
import { GetVehicleHistoryHandler } from '../queries/get-vehicle-history/get-vehicle-history.handler';
import { ListVehiclesHandler } from '../queries/list-vehicles/list-vehicles.handler';
import { CorrectVinHandler } from '../commands/correct-vin/correct-vin.handler';
import { CorrectVinDto } from '../dto/correct-vin.dto';
import { VehicleResponseDto } from '../dto/vehicle-response.dto';
import { GetIncomingTransfersHandler } from '../queries/get-incoming-transfers/get-incoming-transfers.handler';
import { GetOutgoingTransfersHandler } from '../queries/get-outgoing-transfers/get-outgoing-transfers.handler';
import { RegisterVehicleHandler } from '../commands/register-vehicle/register-vehicle.handler';
import { UpdateVehicleHandler } from '../commands/update-vehicle/update-vehicle.handler';
import { DeleteVehicleHandler } from '../commands/delete-vehicle/delete-vehicle.handler';
import { TransferVehicleHandler } from '../commands/transfer-vehicle/transfer-vehicle.handler';
import { GrantAccessHandler } from '../commands/grant-access/grant-access.handler';
import { AcceptTransferHandler } from '../commands/accept-transfer/accept-transfer.handler';
import { RejectTransferHandler } from '../commands/reject-transfer/reject-transfer.handler';
import { CancelTransferHandler } from '../commands/cancel-transfer/cancel-transfer.handler';
import { GenerateTransferQrHandler } from '../commands/generate-transfer-qr/generate-transfer-qr.handler';
import { GenerateConsignmentQrHandler } from '../commands/generate-consignment-qr/generate-consignment-qr.handler';
import { AcceptTransferQrHandler } from '../commands/accept-transfer-qr/accept-transfer-qr.handler';
import { RevokeTransferQrHandler } from '../commands/revoke-transfer-qr/revoke-transfer-qr.handler';
import { StorageR2Service } from '../../../common/storage/storage-r2.service';

/**
 * VehiclesController — D-048 (F-013) authorization + batch signed URLs.
 *
 * Authorization testing approach (documented per spec §12 blocker):
 *
 * The D-048 guard change is EXCLUSIVELY in the controller layer: the 7 write
 * routes now call `assertVehicleOwned` (delegates to VehicleAccessService.assertOwnership)
 * instead of `assertVehicleAccess` (assertOwnershipOrSharedAccess). No handler
 * was modified (validated by TL — handlers contain no internal authorization logic).
 *
 * Authorization is therefore tested here at the controller level by mocking the
 * VehicleAccessService and verifying:
 *   - Which service method is called per route (assertOwnership for writes,
 *     assertOwnershipOrSharedAccess for reads).
 *   - Shared-access scenario: assertOwnership rejects with ForbiddenException →
 *     handler is NOT called, 403 is propagated.
 *   - Owner scenario: assertOwnership resolves → handler is called, result returned.
 *   - super_admin scenario: assertOwnership resolves (service-level check already
 *     covered in vehicle-access.service.spec.ts assertOwnership suite).
 *
 * Batch signed URL tests verify the `?signed=true` query param behavior for both
 * listPhotos and listDocuments without modifying the base DTO contracts.
 *
 * The underlying VehicleAccessService.assertOwnership behavior (shared → 403,
 * owner → resolve, super_admin → resolve) is independently covered in
 * vehicle-access.service.spec.ts.
 */
describe('VehiclesController — D-048 (F-013) authorization + signed URLs', () => {
  let controller: VehiclesController;

  const vehicleAccessService = {
    assertOwnershipOrSharedAccess: jest.fn(),
    assertOwnership: jest.fn(),
    assertDealershipVehicleWrite: jest.fn(),
  };

  const uploadPhotoHandler = { execute: jest.fn() };
  const setPrimaryPhotoHandler = { execute: jest.fn() };
  const deletePhotoHandler = { execute: jest.fn() };
  const uploadDocumentHandler = { execute: jest.fn() };
  const updateDocumentHandler = { execute: jest.fn() };
  const deleteDocumentHandler = { execute: jest.fn() };
  const recordMileageHandler = { execute: jest.fn() };
  const listPhotosHandler = { execute: jest.fn() };
  const listDocumentsHandler = { execute: jest.fn() };
  const getPhotoHandler = { execute: jest.fn() };
  const getDocumentHandler = { execute: jest.fn() };
  const correctVinHandler = { execute: jest.fn() };
  const storage = { getSignedUrl: jest.fn() };

  // Stubs for unused handler deps (not involved in D-048 or signed URLs)
  const stubHandler = { execute: jest.fn() };

  const ownerUser: AuthenticatedUser = {
    id: 'owner-1',
    email: 'owner@test.com',
  };

  const sharedUser: AuthenticatedUser = {
    id: 'shared-1',
    email: 'shared@test.com',
  };

  const superAdminUser: AuthenticatedUser = {
    id: 'super-admin-1',
    email: 'superadmin@test.com',
  };

  // FIX-B1: contextos activos para el forwarding de lectura DEALERSHIP.
  const personalCtx: CurrentContext = {
    type: 'PERSONAL',
    userId: 'owner-1',
  };

  const dealershipCtx: CurrentContext = {
    type: 'DEALERSHIP',
    userId: 'dealer-user-1',
    dealershipId: 'dealership-1',
    memberId: 'member-1',
    roleId: 'role-1',
  };

  const vehicleId = 'v-1';
  const photoId = 'p-1';
  const docId = 'd-1';

  beforeEach(() => {
    jest.clearAllMocks();
    vehicleAccessService.assertOwnershipOrSharedAccess.mockResolvedValue(
      undefined,
    );
    vehicleAccessService.assertOwnership.mockResolvedValue(undefined);
    vehicleAccessService.assertDealershipVehicleWrite.mockResolvedValue(true);
    storage.getSignedUrl.mockResolvedValue('https://r2.example.com/signed');
    controller = new VehiclesController(
      vehicleAccessService as unknown as VehicleAccessService,
      stubHandler as unknown as RegisterVehicleHandler,
      stubHandler as unknown as UpdateVehicleHandler,
      stubHandler as unknown as DeleteVehicleHandler,
      stubHandler as unknown as TransferVehicleHandler,
      recordMileageHandler as unknown as RecordMileageHandler,
      stubHandler as unknown as GrantAccessHandler,
      stubHandler as unknown as GetVehicleHandler,
      stubHandler as unknown as ListVehiclesHandler,
      stubHandler as unknown as GetVehicleHistoryHandler,
      stubHandler as unknown as GetIncomingTransfersHandler,
      stubHandler as unknown as GetOutgoingTransfersHandler,
      stubHandler as unknown as AcceptTransferHandler,
      stubHandler as unknown as RejectTransferHandler,
      stubHandler as unknown as CancelTransferHandler,
      stubHandler as unknown as GenerateTransferQrHandler,
      stubHandler as unknown as GenerateConsignmentQrHandler,
      stubHandler as unknown as AcceptTransferQrHandler,
      stubHandler as unknown as RevokeTransferQrHandler,
      uploadPhotoHandler as unknown as UploadPhotoHandler,
      setPrimaryPhotoHandler as unknown as SetPrimaryPhotoHandler,
      deletePhotoHandler as unknown as DeletePhotoHandler,
      listPhotosHandler as unknown as ListPhotosHandler,
      getPhotoHandler as unknown as GetPhotoHandler,
      uploadDocumentHandler as unknown as UploadDocumentHandler,
      updateDocumentHandler as unknown as UpdateDocumentHandler,
      deleteDocumentHandler as unknown as DeleteDocumentHandler,
      listDocumentsHandler as unknown as ListDocumentsHandler,
      getDocumentHandler as unknown as GetDocumentHandler,
      correctVinHandler as unknown as CorrectVinHandler,
      storage as unknown as StorageR2Service,
    );
  });

  function makeFile(): Express.Multer.File {
    return {
      fieldname: 'file',
      originalname: 'photo.jpg',
      encoding: '7bit',
      mimetype: 'image/jpeg',
      buffer: Buffer.from(''),
      size: 0,
      stream: null,
      destination: '',
      filename: '',
      path: '',
    } as unknown as Express.Multer.File;
  }

  // ═══════════════════════════════════════════════════════════
  // D-048 — Write routes: shared access → 403, owner → success
  // ═══════════════════════════════════════════════════════════

  type WriteCase = {
    label: string;
    invoke: () => Promise<unknown>;
    handlerMock: { execute: jest.Mock };
  };

  const forbiddenError = new ForbiddenException(
    'Only the vehicle owner can perform this operation',
  );

  function writeCases(): WriteCase[] {
    return [
      {
        label: 'POST :id/photos (uploadPhoto)',
        invoke: () =>
          controller.uploadPhoto(vehicleId, makeFile(), personalCtx, sharedUser),
        handlerMock: uploadPhotoHandler,
      },
      {
        label: 'PATCH :id/photos/:photoId/primary (setPrimaryPhoto)',
        invoke: () =>
          controller.setPrimaryPhoto(vehicleId, photoId, personalCtx, sharedUser),
        handlerMock: setPrimaryPhotoHandler,
      },
      {
        label: 'DELETE :id/photos/:photoId (deletePhoto)',
        invoke: () =>
          controller.deletePhoto(vehicleId, photoId, personalCtx, sharedUser),
        handlerMock: deletePhotoHandler,
      },
      {
        label: 'POST :id/documents (uploadDocument)',
        invoke: () =>
          controller.uploadDocument(
            vehicleId,
            { name: 'doc', documentType: 'insurance' },
            makeFile(),
            personalCtx,
            sharedUser,
          ),
        handlerMock: uploadDocumentHandler,
      },
      {
        label: 'PATCH :id/documents/:docId (updateDocument)',
        invoke: () =>
          controller.updateDocument(
            vehicleId,
            docId,
            {},
            personalCtx,
            sharedUser,
          ),
        handlerMock: updateDocumentHandler,
      },
      {
        label: 'DELETE :id/documents/:docId (deleteDocument)',
        invoke: () =>
          controller.deleteDocument(vehicleId, docId, personalCtx, sharedUser),
        handlerMock: deleteDocumentHandler,
      },
    ];
  }

  describe('Shared access (VehicleAccess holder) → 403 Forbidden on writes', () => {
    it.each(writeCases())(
      '$label → 403 and handler NOT called',
      async ({ invoke, handlerMock }) => {
        vehicleAccessService.assertOwnership.mockRejectedValue(forbiddenError);

        await expect(invoke()).rejects.toThrow(ForbiddenException);
        expect(handlerMock.execute).not.toHaveBeenCalled();
        expect(vehicleAccessService.assertOwnership).toHaveBeenCalledWith({
          vehicleId,
          user: sharedUser,
        });
      },
    );
  });

  describe('Owner → success on writes', () => {
    it.each(writeCases())(
      '$label → handler called, owner check passed',
      async ({ invoke, handlerMock }) => {
        vehicleAccessService.assertOwnership.mockResolvedValue(undefined);
        handlerMock.execute.mockResolvedValue({ id: 'result' });

        await expect(invoke()).resolves.not.toThrow();
        expect(handlerMock.execute).toHaveBeenCalled();
        expect(vehicleAccessService.assertOwnership).toHaveBeenCalledWith({
          vehicleId,
          user: sharedUser,
        });
      },
    );
  });

  describe('super_admin → allowed on writes (representative case)', () => {
    it('uploadPhoto — super_admin → handler called (assertOwnership resolves via super_admin path)', async () => {
      vehicleAccessService.assertOwnership.mockResolvedValue(undefined);
      uploadPhotoHandler.execute.mockResolvedValue({
        id: 'p-new',
        vehicleId,
        key: 'k1',
        caption: null,
        isPrimary: true,
        createdAt: new Date(),
      });

      const result = await controller.uploadPhoto(
        vehicleId,
        makeFile(),
        personalCtx,
        superAdminUser,
      );

      expect(vehicleAccessService.assertOwnership).toHaveBeenCalledWith({
        vehicleId,
        user: superAdminUser,
      });
      expect(uploadPhotoHandler.execute).toHaveBeenCalled();
      expect(result).toMatchObject({ id: 'p-new', vehicleId });
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Gap 1: recordMileage ya NO autoriza en el controller (lo hace el handler,
  // que soporta PERSONAL y DEALERSHIP). El controller solo reenvía el contexto.
  // ═══════════════════════════════════════════════════════════

  describe('POST :id/mileage (Gap 1 — autorización delegada al handler)', () => {
    it('reenvía vehículo, dto, usuario y contexto sin llamar a assertOwnership', async () => {
      recordMileageHandler.execute.mockResolvedValue({ id: 'mi-1' });

      const result = await controller.recordMileage(
        vehicleId,
        { mileage: 10000 },
        personalCtx,
        sharedUser,
      );

      expect(vehicleAccessService.assertOwnership).not.toHaveBeenCalled();
      expect(recordMileageHandler.execute).toHaveBeenCalledTimes(1);
      const command = recordMileageHandler.execute.mock.calls[0][0];
      expect(command).toMatchObject({
        vehicleId,
        dto: { mileage: 10000 },
        recordedByUserId: sharedUser.id,
        context: personalCtx,
      });
      expect(result).toEqual({ id: 'mi-1' });
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Gap 1 — D-03/D-144: POST :id/vin-correction delega la autorización al
  // handler (canCorrectVin) y solo reenvía vehículo, dto, usuario y contexto.
  // ═══════════════════════════════════════════════════════════

  describe('POST :id/vin-correction (Gap 1 — D-03/D-144 / Security B6)', () => {
    const correctVinDto: CorrectVinDto = {
      vin: '1HGCM82633A004352',
      reason: 'VIN mal tipeado en el alta',
    };

    // Shape que devuelve correct-vin.handler: vehículo Prisma con versión
    // hidratada y ownerships crudos. La respuesta HTTP NO debe ser ese objeto
    // crudo sino VehicleResponseDto (D-11).
    const hydratedVehicle = {
      id: vehicleId,
      licensePlate: 'ABC123',
      vin: '1HGCM82633A004352',
      engineNumber: null,
      versionId: 'ver-1',
      manufactureYear: null,
      modelYear: null,
      color: null,
      notes: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      version: {
        id: 'ver-1',
        name: '1.6 LX',
        model: {
          id: 'model-1',
          name: 'Civic',
          brand: { id: 'brand-1', name: 'Honda' },
        },
      },
      ownerships: [{ id: 'own-1', vehicleId, userId: 'u-1' }],
    };

    it('reenvía vehículo, dto, usuario y contexto PERSONAL sin autorizar en el controller', async () => {
      correctVinHandler.execute.mockResolvedValue(hydratedVehicle);

      const result = (await controller.correctVin(
        vehicleId,
        correctVinDto,
        personalCtx,
        sharedUser,
      )) as VehicleResponseDto;

      expect(vehicleAccessService.assertOwnership).not.toHaveBeenCalled();
      expect(
        vehicleAccessService.assertOwnershipOrSharedAccess,
      ).not.toHaveBeenCalled();
      expect(correctVinHandler.execute).toHaveBeenCalledTimes(1);
      const command = correctVinHandler.execute.mock.calls[0][0];
      expect(command).toMatchObject({
        vehicleId,
        dto: correctVinDto,
        actorUserId: sharedUser.id,
        context: personalCtx,
      });
      // Security B6 / D-11: mapeado con VehicleResponseDto, no el modelo crudo.
      expect(result.id).toBe(vehicleId);
      expect(result.brand).toBe('Honda');
      expect(result.model).toBe('Civic');
      expect(result.version).toBe('1.6 LX');
      expect(result.brandId).toBe('brand-1');
      expect(result.versionId).toBe('ver-1');
    });

    it('reenvía el contexto DEALERSHIP tal cual (D-144: owner/admin titular)', async () => {
      correctVinHandler.execute.mockResolvedValue(hydratedVehicle);

      await controller.correctVin(
        vehicleId,
        correctVinDto,
        dealershipCtx,
        sharedUser,
      );

      const command = correctVinHandler.execute.mock.calls[0][0];
      expect(command).toMatchObject({ context: dealershipCtx });
    });
  });

  // ═══════════════════════════════════════════════════════════
  // D-133/D-149: PATCH :id — la concesionaria TITULAR ACTIVA edita.
  // DEALERSHIP → assertDealershipVehicleWrite; PERSONAL → assertVehicleOwned.
  // El resto de rutas (delete, grant-access, uploadPhoto, QR, ...) no cambian.
  // ═══════════════════════════════════════════════════════════

  describe('PATCH :id (update) — D-133/D-149 concesionaria titular', () => {
    it('DEALERSHIP → autoriza con assertDealershipVehicleWrite y delega al handler', async () => {
      vehicleAccessService.assertDealershipVehicleWrite.mockResolvedValue(true);
      stubHandler.execute.mockResolvedValue({ id: vehicleId });

      await controller.update(
        vehicleId,
        { color: 'Rojo' },
        dealershipCtx,
        sharedUser,
      );

      expect(
        vehicleAccessService.assertDealershipVehicleWrite,
      ).toHaveBeenCalledWith(vehicleId, sharedUser.id, dealershipCtx);
      expect(vehicleAccessService.assertOwnership).not.toHaveBeenCalled();
      expect(
        vehicleAccessService.assertOwnershipOrSharedAccess,
      ).not.toHaveBeenCalled();
      expect(stubHandler.execute).toHaveBeenCalledTimes(1);
    });

    it('DEALERSHIP sin titularidad ni ownership → 403 y handler NO llamado', async () => {
      // Sin titularidad de concesionaria Y sin ownership personal/super_admin:
      // el fallback assertVehicleOwned rechaza y el 403 se propaga.
      vehicleAccessService.assertDealershipVehicleWrite.mockResolvedValue(
        false,
      );
      vehicleAccessService.assertOwnership.mockRejectedValue(forbiddenError);

      await expect(
        controller.update(vehicleId, { color: 'Rojo' }, dealershipCtx, sharedUser),
      ).rejects.toThrow(ForbiddenException);

      expect(stubHandler.execute).not.toHaveBeenCalled();
      expect(vehicleAccessService.assertOwnership).toHaveBeenCalledWith({
        vehicleId,
        user: sharedUser,
      });
    });

    it('DEALERSHIP sin titularidad pero super_admin → autorizado por assertVehicleOwned, handler invocado', async () => {
      // Regresión: super_admin en contexto DEALERSHIP. No autoriza la rama de
      // concesionaria, pero el fallback assertVehicleOwned (owner personal /
      // super_admin) resuelve → no 403 y el handler se ejecuta.
      vehicleAccessService.assertDealershipVehicleWrite.mockResolvedValue(
        false,
      );
      vehicleAccessService.assertOwnership.mockResolvedValue(undefined);
      stubHandler.execute.mockResolvedValue({ id: vehicleId });

      await controller.update(
        vehicleId,
        { color: 'Rojo' },
        dealershipCtx,
        superAdminUser,
      );

      expect(
        vehicleAccessService.assertDealershipVehicleWrite,
      ).toHaveBeenCalledWith(vehicleId, superAdminUser.id, dealershipCtx);
      expect(vehicleAccessService.assertOwnership).toHaveBeenCalledWith({
        vehicleId,
        user: superAdminUser,
      });
      expect(stubHandler.execute).toHaveBeenCalledTimes(1);
    });

    it('PERSONAL → mantiene assertVehicleOwned (assertOwnership), sin rama de concesionaria', async () => {
      vehicleAccessService.assertOwnership.mockResolvedValue(undefined);
      stubHandler.execute.mockResolvedValue({ id: vehicleId });

      await controller.update(
        vehicleId,
        { color: 'Rojo' },
        personalCtx,
        ownerUser,
      );

      expect(vehicleAccessService.assertOwnership).toHaveBeenCalledWith({
        vehicleId,
        user: ownerUser,
      });
      expect(
        vehicleAccessService.assertDealershipVehicleWrite,
      ).not.toHaveBeenCalled();
      expect(stubHandler.execute).toHaveBeenCalledTimes(1);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // D-133/D-149 (extensión a media): fotos/documentos — la concesionaria
  // TITULAR ACTIVA administra la media con dealership.vehicle.edit.
  // Mismo patrón que PATCH /:id. Antes: assertVehicleOwned puro → 403 en
  // exhibición (el frontend ofrecía la UI vía capabilities.canEdit=true).
  // ═══════════════════════════════════════════════════════════

  describe('Media writes — D-133/D-149 concesionaria titular administra fotos/documentos', () => {
    // Cada caso llama al controller con dealershipCtx (antes personalCtx).
    const dealershipWriteCases: WriteCase[] = [
      {
        label: 'POST :id/photos (uploadPhoto)',
        invoke: () =>
          controller.uploadPhoto(
            vehicleId,
            makeFile(),
            dealershipCtx,
            sharedUser,
          ),
        handlerMock: uploadPhotoHandler,
      },
      {
        label: 'PATCH :id/photos/:photoId/primary (setPrimaryPhoto)',
        invoke: () =>
          controller.setPrimaryPhoto(
            vehicleId,
            photoId,
            dealershipCtx,
            sharedUser,
          ),
        handlerMock: setPrimaryPhotoHandler,
      },
      {
        label: 'DELETE :id/photos/:photoId (deletePhoto)',
        invoke: () =>
          controller.deletePhoto(vehicleId, photoId, dealershipCtx, sharedUser),
        handlerMock: deletePhotoHandler,
      },
      {
        label: 'POST :id/documents (uploadDocument)',
        invoke: () =>
          controller.uploadDocument(
            vehicleId,
            { name: 'doc', documentType: 'insurance' },
            makeFile(),
            dealershipCtx,
            sharedUser,
          ),
        handlerMock: uploadDocumentHandler,
      },
      {
        label: 'PATCH :id/documents/:docId (updateDocument)',
        invoke: () =>
          controller.updateDocument(
            vehicleId,
            docId,
            {},
            dealershipCtx,
            sharedUser,
          ),
        handlerMock: updateDocumentHandler,
      },
      {
        label: 'DELETE :id/documents/:docId (deleteDocument)',
        invoke: () =>
          controller.deleteDocument(vehicleId, docId, dealershipCtx, sharedUser),
        handlerMock: deleteDocumentHandler,
      },
    ];

    it.each(dealershipWriteCases)(
      '$label → DEALERSHIP titular → autoriza con assertDealershipVehicleWrite, sin assertOwnership',
      async ({ invoke, handlerMock }) => {
        vehicleAccessService.assertDealershipVehicleWrite.mockResolvedValue(
          true,
        );
        handlerMock.execute.mockResolvedValue({ id: 'result' });

        await expect(invoke()).resolves.not.toThrow();
        expect(
          vehicleAccessService.assertDealershipVehicleWrite,
        ).toHaveBeenCalledWith(vehicleId, sharedUser.id, dealershipCtx);
        expect(vehicleAccessService.assertOwnership).not.toHaveBeenCalled();
        expect(handlerMock.execute).toHaveBeenCalled();
      },
    );

    it.each(dealershipWriteCases)(
      '$label → DEALERSHIP sin titularidad ni ownership → 403 (fallback assertVehicleOwned), handler NO llamado',
      async ({ invoke, handlerMock }) => {
        vehicleAccessService.assertDealershipVehicleWrite.mockResolvedValue(
          false,
        );
        vehicleAccessService.assertOwnership.mockRejectedValue(forbiddenError);

        await expect(invoke()).rejects.toThrow(ForbiddenException);
        expect(vehicleAccessService.assertOwnership).toHaveBeenCalledWith({
          vehicleId,
          user: sharedUser,
        });
        expect(handlerMock.execute).not.toHaveBeenCalled();
      },
    );

    it('uploadPhoto → DEALERSHIP sin titularidad pero super_admin → autorizado por fallback', async () => {
      vehicleAccessService.assertDealershipVehicleWrite.mockResolvedValue(
        false,
      );
      vehicleAccessService.assertOwnership.mockResolvedValue(undefined);
      uploadPhotoHandler.execute.mockResolvedValue({
        id: 'p-new',
        vehicleId,
        key: 'k1',
        caption: null,
        isPrimary: true,
        createdAt: new Date(),
      });

      await controller.uploadPhoto(
        vehicleId,
        makeFile(),
        dealershipCtx,
        superAdminUser,
      );

      expect(
        vehicleAccessService.assertDealershipVehicleWrite,
      ).toHaveBeenCalledWith(vehicleId, superAdminUser.id, dealershipCtx);
      expect(vehicleAccessService.assertOwnership).toHaveBeenCalledWith({
        vehicleId,
        user: superAdminUser,
      });
      expect(uploadPhotoHandler.execute).toHaveBeenCalledTimes(1);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Read routes: shared access → assertOwnershipOrSharedAccess used (NOT assertOwnership)
  // ═══════════════════════════════════════════════════════════

  describe('Read routes use assertOwnershipOrSharedAccess (D-048: reads unchanged)', () => {
    const vehicleRecord = { id: vehicleId };
    const photoRecord = {
      id: photoId,
      vehicleId,
      key: 'vehicles/v-1/photos/abc.webp',
      caption: null,
      isPrimary: true,
      createdAt: new Date('2025-01-01'),
    };
    const docRecord = {
      id: docId,
      vehicleId,
      key: 'vehicles/v-1/documents/doc.pdf',
      name: 'Insurance',
      documentType: 'insurance',
      expiresAt: new Date('2026-12-31'),
      createdAt: new Date('2025-01-01'),
      updatedAt: new Date('2025-06-01'),
    };

    it('GET :id (findOne) uses assertOwnershipOrSharedAccess with the active context', async () => {
      stubHandler.execute.mockResolvedValue(vehicleRecord);
      await controller.findOne(vehicleId, sharedUser, personalCtx);
      expect(
        vehicleAccessService.assertOwnershipOrSharedAccess,
      ).toHaveBeenCalledWith({
        vehicleId,
        user: sharedUser,
        context: personalCtx,
      });
    });

    it('GET :id/photos (listPhotos) uses assertOwnershipOrSharedAccess with the active context', async () => {
      listPhotosHandler.execute.mockResolvedValue([photoRecord]);
      const result = await controller.listPhotos(vehicleId, sharedUser, personalCtx);
      expect(
        vehicleAccessService.assertOwnershipOrSharedAccess,
      ).toHaveBeenCalledWith({
        vehicleId,
        user: sharedUser,
        context: personalCtx,
      });
      expect(result).toEqual([expect.objectContaining({ id: photoId })]);
    });

    it('GET :id/documents (listDocuments) uses assertOwnershipOrSharedAccess with the active context', async () => {
      listDocumentsHandler.execute.mockResolvedValue([docRecord]);
      const result = await controller.listDocuments(vehicleId, sharedUser, personalCtx);
      expect(
        vehicleAccessService.assertOwnershipOrSharedAccess,
      ).toHaveBeenCalledWith({
        vehicleId,
        user: sharedUser,
        context: personalCtx,
      });
      expect(result).toEqual([expect.objectContaining({ id: docId })]);
    });

    it('GET :id/history (getHistory) uses assertOwnershipOrSharedAccess with the active context', async () => {
      stubHandler.execute.mockResolvedValue({ history: [] });
      await controller.getHistory(vehicleId, sharedUser, personalCtx);
      expect(
        vehicleAccessService.assertOwnershipOrSharedAccess,
      ).toHaveBeenCalledWith({
        vehicleId,
        user: sharedUser,
        context: personalCtx,
      });
    });

    // ═══════════════════════════════════════════════════════════
    // FIX-B1: forwarding del contexto DEALERSHIP (RB-04) en lectura
    // ═══════════════════════════════════════════════════════════

    it('GET :id (findOne) forwards DEALERSHIP context to assertOwnershipOrSharedAccess', async () => {
      stubHandler.execute.mockResolvedValue(vehicleRecord);
      await controller.findOne(vehicleId, sharedUser, dealershipCtx);
      expect(
        vehicleAccessService.assertOwnershipOrSharedAccess,
      ).toHaveBeenCalledWith({
        vehicleId,
        user: sharedUser,
        context: dealershipCtx,
      });
    });

    it('GET :id/history (getHistory) forwards DEALERSHIP context to assertOwnershipOrSharedAccess', async () => {
      stubHandler.execute.mockResolvedValue({ history: [] });
      await controller.getHistory(vehicleId, sharedUser, dealershipCtx);
      expect(
        vehicleAccessService.assertOwnershipOrSharedAccess,
      ).toHaveBeenCalledWith({
        vehicleId,
        user: sharedUser,
        context: dealershipCtx,
      });
    });

    // Gap fix: las lecturas de media (photos/documents) antes NO reenviaban el
    // contexto → la rama DEALERSHIP (FIX-B1) nunca se evaluaba → 403 en
    // exhibición. Ahora reenvían ctx igual que findOne/getHistory.

    it('GET :id/photos (listPhotos) forwards DEALERSHIP context', async () => {
      listPhotosHandler.execute.mockResolvedValue([photoRecord]);
      await controller.listPhotos(vehicleId, sharedUser, dealershipCtx);
      expect(
        vehicleAccessService.assertOwnershipOrSharedAccess,
      ).toHaveBeenCalledWith({
        vehicleId,
        user: sharedUser,
        context: dealershipCtx,
      });
    });

    it('GET :id/photos/:photoId (getPhoto) forwards DEALERSHIP context', async () => {
      getPhotoHandler.execute.mockResolvedValue(photoRecord);
      await controller.getPhoto(vehicleId, photoId, sharedUser, dealershipCtx);
      expect(
        vehicleAccessService.assertOwnershipOrSharedAccess,
      ).toHaveBeenCalledWith({
        vehicleId,
        user: sharedUser,
        context: dealershipCtx,
      });
    });

    it('GET :id/documents (listDocuments) forwards DEALERSHIP context', async () => {
      listDocumentsHandler.execute.mockResolvedValue([docRecord]);
      await controller.listDocuments(vehicleId, sharedUser, dealershipCtx);
      expect(
        vehicleAccessService.assertOwnershipOrSharedAccess,
      ).toHaveBeenCalledWith({
        vehicleId,
        user: sharedUser,
        context: dealershipCtx,
      });
    });

    it('GET :id/documents/:docId (getDocument) forwards DEALERSHIP context', async () => {
      getDocumentHandler.execute.mockResolvedValue(docRecord);
      await controller.getDocument(vehicleId, docId, sharedUser, dealershipCtx);
      expect(
        vehicleAccessService.assertOwnershipOrSharedAccess,
      ).toHaveBeenCalledWith({
        vehicleId,
        user: sharedUser,
        context: dealershipCtx,
      });
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Batch signed URLs — GET :id/photos?signed=true / GET :id/documents?signed=true
  // ═══════════════════════════════════════════════════════════

  describe('GET :id/photos — batch signed URLs', () => {
    const photoRecord = {
      id: photoId,
      vehicleId,
      key: 'vehicles/v-1/photos/abc.webp',
      caption: 'Front view',
      isPrimary: true,
      createdAt: new Date('2025-01-01'),
    };

    it('without ?signed=true → contract without url (backward compatible)', async () => {
      listPhotosHandler.execute.mockResolvedValue([photoRecord]);
      const result = await controller.listPhotos(vehicleId, ownerUser, personalCtx);

      expect(result).toEqual([
        {
          id: photoId,
          vehicleId,
          key: 'vehicles/v-1/photos/abc.webp',
          caption: 'Front view',
          isPrimary: true,
          createdAt: new Date('2025-01-01'),
        },
      ]);
      expect(storage.getSignedUrl).not.toHaveBeenCalled();
    });

    it('with ?signed=true → each item has url and expiresAt', async () => {
      listPhotosHandler.execute.mockResolvedValue([photoRecord]);
      const result = (await controller.listPhotos(
        vehicleId,
        ownerUser,
        personalCtx,
        'true',
      )) as Array<PhotoResponseDto & { url: string; expiresAt: Date }>;

      expect(storage.getSignedUrl).toHaveBeenCalledWith(
        'vehicles/v-1/photos/abc.webp',
      );
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(
        expect.objectContaining({
          id: photoId,
          vehicleId,
          key: 'vehicles/v-1/photos/abc.webp',
          caption: 'Front view',
          isPrimary: true,
          createdAt: new Date('2025-01-01'),
          url: 'https://r2.example.com/signed',
        }),
      );
      // expiresAt should be roughly now + 3600s (SIGNED_URL_EXPIRES_SECONDS default)
      const expiresAt = result[0].expiresAt;
      expect(expiresAt).toBeInstanceOf(Date);
      const expectedMin = new Date(Date.now() + 3500 * 1000);
      const expectedMax = new Date(Date.now() + 3700 * 1000);
      expect(expiresAt.getTime()).toBeGreaterThanOrEqual(expectedMin.getTime());
      expect(expiresAt.getTime()).toBeLessThanOrEqual(expectedMax.getTime());
    });

    it('with ?signed=false → contract without url (treated as unsigned)', async () => {
      listPhotosHandler.execute.mockResolvedValue([photoRecord]);
      const result = await controller.listPhotos(
        vehicleId,
        ownerUser,
        personalCtx,
        'false',
      );

      expect(storage.getSignedUrl).not.toHaveBeenCalled();
      expect(result).toHaveLength(1);
      expect(result[0]).not.toHaveProperty('url');
      expect(result[0]).not.toHaveProperty('expiresAt');
    });

    it('multiple photos → all get signed urls', async () => {
      const photo2 = {
        ...photoRecord,
        id: 'p-2',
        key: 'vehicles/v-1/photos/def.webp',
      };
      listPhotosHandler.execute.mockResolvedValue([photoRecord, photo2]);

      const result = (await controller.listPhotos(
        vehicleId,
        ownerUser,
        personalCtx,
        'true',
      )) as Array<PhotoResponseDto & { url: string }>;

      expect(storage.getSignedUrl).toHaveBeenCalledTimes(2);
      expect(storage.getSignedUrl).toHaveBeenCalledWith(
        'vehicles/v-1/photos/abc.webp',
      );
      expect(storage.getSignedUrl).toHaveBeenCalledWith(
        'vehicles/v-1/photos/def.webp',
      );
      expect(result).toHaveLength(2);
      expect(result[0].url).toBe('https://r2.example.com/signed');
      expect(result[1].url).toBe('https://r2.example.com/signed');
    });
  });

  describe('GET :id/documents — batch signed URLs', () => {
    const docRecord = {
      id: docId,
      vehicleId,
      key: 'vehicles/v-1/documents/doc.pdf',
      name: 'Insurance Policy',
      documentType: 'insurance',
      expiresAt: new Date('2026-12-31'),
      createdAt: new Date('2025-01-01'),
      updatedAt: new Date('2025-06-01'),
    };

    it('without ?signed=true → contract without url or urlExpiresAt (backward compatible)', async () => {
      listDocumentsHandler.execute.mockResolvedValue([docRecord]);
      const result = await controller.listDocuments(vehicleId, ownerUser, personalCtx);

      expect(result).toEqual([
        {
          id: docId,
          vehicleId,
          key: 'vehicles/v-1/documents/doc.pdf',
          name: 'Insurance Policy',
          documentType: 'insurance',
          expiresAt: new Date('2026-12-31'),
          createdAt: new Date('2025-01-01'),
          updatedAt: new Date('2025-06-01'),
        },
      ]);
      expect(storage.getSignedUrl).not.toHaveBeenCalled();
    });

    it('with ?signed=true → each item has url and urlExpiresAt (not expiresAt)', async () => {
      listDocumentsHandler.execute.mockResolvedValue([docRecord]);
      const result = (await controller.listDocuments(
        vehicleId,
        ownerUser,
        personalCtx,
        'true',
      )) as Array<DocumentResponseDto & { url: string; urlExpiresAt: Date }>;

      expect(storage.getSignedUrl).toHaveBeenCalledWith(
        'vehicles/v-1/documents/doc.pdf',
      );
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(
        expect.objectContaining({
          id: docId,
          vehicleId,
          key: 'vehicles/v-1/documents/doc.pdf',
          name: 'Insurance Policy',
          documentType: 'insurance',
          expiresAt: new Date('2026-12-31'),
          createdAt: new Date('2025-01-01'),
          updatedAt: new Date('2025-06-01'),
          url: 'https://r2.example.com/signed',
        }),
      );
      // urlExpiresAt should be roughly now + 3600s
      const urlExpiresAt = result[0].urlExpiresAt;
      expect(urlExpiresAt).toBeInstanceOf(Date);
      const expectedMin = new Date(Date.now() + 3500 * 1000);
      const expectedMax = new Date(Date.now() + 3700 * 1000);
      expect(urlExpiresAt.getTime()).toBeGreaterThanOrEqual(
        expectedMin.getTime(),
      );
      expect(urlExpiresAt.getTime()).toBeLessThanOrEqual(expectedMax.getTime());
    });

    it('with ?signed=false → contract without url or urlExpiresAt', async () => {
      listDocumentsHandler.execute.mockResolvedValue([docRecord]);
      const result = await controller.listDocuments(
        vehicleId,
        ownerUser,
        personalCtx,
        'false',
      );

      expect(storage.getSignedUrl).not.toHaveBeenCalled();
      expect(result).toHaveLength(1);
      expect(result[0]).not.toHaveProperty('url');
      expect(result[0]).not.toHaveProperty('urlExpiresAt');
      expect(result[0]).toEqual({
        id: docId,
        vehicleId,
        key: 'vehicles/v-1/documents/doc.pdf',
        name: 'Insurance Policy',
        documentType: 'insurance',
        expiresAt: new Date('2026-12-31'),
        createdAt: new Date('2025-01-01'),
        updatedAt: new Date('2025-06-01'),
      });
    });

    it('documents without expiresAt → urlExpiresAt still present, original expiresAt null', async () => {
      const noExpiryDoc = { ...docRecord, expiresAt: null };
      listDocumentsHandler.execute.mockResolvedValue([noExpiryDoc]);

      const result = (await controller.listDocuments(
        vehicleId,
        ownerUser,
        personalCtx,
        'true',
      )) as Array<DocumentResponseDto & { urlExpiresAt: Date }>;

      expect(result[0].expiresAt).toBeNull();
      expect(result[0].urlExpiresAt).toBeInstanceOf(Date);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Write route signed URLs remain individual (no batch)
  // ═══════════════════════════════════════════════════════════

  describe('GET :id/photos/:photoId (individual photo — unchanged by D-048)', () => {
    it('without ?signed=true → returns PhotoResponseDto', async () => {
      getPhotoHandler.execute.mockResolvedValue({
        id: photoId,
        vehicleId,
        key: 'vehicles/v-1/photos/abc.webp',
        caption: null,
        isPrimary: true,
        createdAt: new Date(),
      });

      const result = await controller.getPhoto(
        vehicleId,
        photoId,
        ownerUser,
        personalCtx,
      );
      expect(result).toEqual(
        expect.objectContaining({ id: photoId, vehicleId }),
      );
      expect(storage.getSignedUrl).not.toHaveBeenCalled();
    });

    it('with ?signed=true → returns { url, expiresAt }', async () => {
      getPhotoHandler.execute.mockResolvedValue({
        id: photoId,
        vehicleId,
        key: 'vehicles/v-1/photos/abc.webp',
        caption: null,
        isPrimary: true,
        createdAt: new Date(),
      });

      const result = await controller.getPhoto(
        vehicleId,
        photoId,
        ownerUser,
        personalCtx,
        'true',
      );
      expect(result).toEqual(
        expect.objectContaining({
          url: 'https://r2.example.com/signed',
        }),
      );
      expect((result as { expiresAt: Date }).expiresAt).toBeInstanceOf(Date);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Catálogo estático de tipos de documento (Tarea 1)
  // ═══════════════════════════════════════════════════════════

  describe('GET documents/types — catálogo estático de tipos de documento', () => {
    it('returns the static catalog (only VTV for now) with { value, label } shape', () => {
      const result = controller.getDocumentTypes();

      expect(result).toEqual([
        { value: 'VTV', label: 'VTV — Verificación Técnica Vehicular' },
      ]);
      // El catálogo es la fuente única para el dropdown; cada entry expone
      // el valor que va en documentType y el label para UI.
      for (const entry of result) {
        expect(entry).toHaveProperty('value');
        expect(entry).toHaveProperty('label');
      }
    });
  });
});
