import { ForbiddenException } from '@nestjs/common';
import { MileageSource } from '@prisma/client';

// Mock uuid (ESM module) before importing anything that transitively loads StorageR2Service
jest.mock('uuid', () => ({ v4: () => 'test-uuid' }));

import { VehiclesController } from './vehicles.controller';
import { VehicleAccessService } from '../../../common/authorization/vehicle-access.service';
import { PhotoResponseDto } from '../dto/photo-response.dto';
import { DocumentResponseDto } from '../dto/document-response.dto';
import { AuthenticatedUser } from '../../../common/types/auth.types';
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

  const vehicleId = 'v-1';
  const photoId = 'p-1';
  const docId = 'd-1';

  beforeEach(() => {
    jest.clearAllMocks();
    vehicleAccessService.assertOwnershipOrSharedAccess.mockResolvedValue(
      undefined,
    );
    vehicleAccessService.assertOwnership.mockResolvedValue(undefined);
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
        invoke: () => controller.uploadPhoto(vehicleId, makeFile(), sharedUser),
        handlerMock: uploadPhotoHandler,
      },
      {
        label: 'PATCH :id/photos/:photoId/primary (setPrimaryPhoto)',
        invoke: () =>
          controller.setPrimaryPhoto(vehicleId, photoId, sharedUser),
        handlerMock: setPrimaryPhotoHandler,
      },
      {
        label: 'DELETE :id/photos/:photoId (deletePhoto)',
        invoke: () => controller.deletePhoto(vehicleId, photoId, sharedUser),
        handlerMock: deletePhotoHandler,
      },
      {
        label: 'POST :id/documents (uploadDocument)',
        invoke: () =>
          controller.uploadDocument(
            vehicleId,
            { name: 'doc', documentType: 'insurance' },
            makeFile(),
            sharedUser,
          ),
        handlerMock: uploadDocumentHandler,
      },
      {
        label: 'PATCH :id/documents/:docId (updateDocument)',
        invoke: () =>
          controller.updateDocument(vehicleId, docId, {}, sharedUser),
        handlerMock: updateDocumentHandler,
      },
      {
        label: 'DELETE :id/documents/:docId (deleteDocument)',
        invoke: () => controller.deleteDocument(vehicleId, docId, sharedUser),
        handlerMock: deleteDocumentHandler,
      },
      {
        label: 'POST :id/mileage (recordMileage)',
        invoke: () =>
          controller.recordMileage(
            vehicleId,
            { mileage: 10000, source: MileageSource.owner },
            sharedUser,
          ),
        handlerMock: recordMileageHandler,
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

    it('GET :id (findOne) uses assertOwnershipOrSharedAccess', async () => {
      stubHandler.execute.mockResolvedValue(vehicleRecord);
      await controller.findOne(vehicleId, sharedUser);
      expect(
        vehicleAccessService.assertOwnershipOrSharedAccess,
      ).toHaveBeenCalledWith({
        vehicleId,
        user: sharedUser,
      });
    });

    it('GET :id/photos (listPhotos) uses assertOwnershipOrSharedAccess', async () => {
      listPhotosHandler.execute.mockResolvedValue([photoRecord]);
      const result = await controller.listPhotos(vehicleId, sharedUser);
      expect(
        vehicleAccessService.assertOwnershipOrSharedAccess,
      ).toHaveBeenCalledWith({
        vehicleId,
        user: sharedUser,
      });
      expect(result).toEqual([expect.objectContaining({ id: photoId })]);
    });

    it('GET :id/documents (listDocuments) uses assertOwnershipOrSharedAccess', async () => {
      listDocumentsHandler.execute.mockResolvedValue([docRecord]);
      const result = await controller.listDocuments(vehicleId, sharedUser);
      expect(
        vehicleAccessService.assertOwnershipOrSharedAccess,
      ).toHaveBeenCalledWith({
        vehicleId,
        user: sharedUser,
      });
      expect(result).toEqual([expect.objectContaining({ id: docId })]);
    });

    it('GET :id/history (getHistory) uses assertOwnershipOrSharedAccess', async () => {
      stubHandler.execute.mockResolvedValue({ history: [] });
      await controller.getHistory(vehicleId, sharedUser);
      expect(
        vehicleAccessService.assertOwnershipOrSharedAccess,
      ).toHaveBeenCalledWith({
        vehicleId,
        user: sharedUser,
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
      const result = await controller.listPhotos(vehicleId, ownerUser);

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
      const result = await controller.listPhotos(vehicleId, ownerUser, 'false');

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
      const result = await controller.listDocuments(vehicleId, ownerUser);

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

      const result = await controller.getPhoto(vehicleId, photoId, ownerUser);
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
});
