import { BadRequestException } from '@nestjs/common';
import {
  ALLOWED_IMAGE_MIMES,
  ALLOWED_DOCUMENT_MIMES,
  fileTypeFilter,
} from './file-upload.utils';

/**
 * Unit tests for file upload MIME validation (Wave P2 — B3).
 *
 * Verifies:
 * - ALLOWED_IMAGE_MIMES: JPEG, PNG, WebP, AVIF pass for photos
 * - ALLOWED_DOCUMENT_MIMES: all image types + PDF pass for documents
 * - fileTypeFilter rejects non-allowed types with BadRequestException (400)
 * - Disallowed types: .exe, .txt, .zip, etc.
 */
describe('fileTypeFilter (Wave P2 — B3)', () => {
  const cbOk = jest.fn();
  const cbReject = jest.fn();

  beforeEach(() => {
    cbOk.mockClear();
    cbReject.mockClear();
  });

  function makeFile(mimetype: string): Express.Multer.File {
    return {
      mimetype,
      fieldname: 'file',
      originalname: `test.${mimetype.split('/')[1]}`,
      encoding: '7bit',
      buffer: Buffer.from(''),
      size: 0,
      stream: null as any,
      destination: '',
      filename: '',
      path: '',
    } as Express.Multer.File;
  }

  describe('ALLOWED_IMAGE_MIMES', () => {
    it('should contain exactly the four expected image types', () => {
      expect(ALLOWED_IMAGE_MIMES).toEqual([
        'image/jpeg',
        'image/png',
        'image/webp',
        'image/avif',
      ]);
    });
  });

  describe('ALLOWED_DOCUMENT_MIMES', () => {
    it('should contain all image types plus PDF', () => {
      expect(ALLOWED_DOCUMENT_MIMES).toEqual([
        'image/jpeg',
        'image/png',
        'image/webp',
        'image/avif',
        'application/pdf',
      ]);
    });
  });

  describe('fileTypeFilter with ALLOWED_IMAGE_MIMES (photos)', () => {
    const filter = fileTypeFilter(ALLOWED_IMAGE_MIMES);

    it.each([
      ['image/jpeg', 'JPEG'],
      ['image/png', 'PNG'],
      ['image/webp', 'WebP'],
      ['image/avif', 'AVIF'],
    ])('should accept %s (%s)', (mime) => {
      filter(undefined, makeFile(mime), cbOk);
      expect(cbOk).toHaveBeenCalledWith(null, true);
      expect(cbReject).not.toHaveBeenCalled();
    });

    it('should reject application/pdf for photos', () => {
      filter(undefined, makeFile('application/pdf'), cbReject);
      expect(cbReject).toHaveBeenCalled();
      const err = cbReject.mock.calls[0][0];
      expect(err).toBeInstanceOf(BadRequestException);
    });

    it('should reject application/x-msdownload (.exe)', () => {
      filter(undefined, makeFile('application/x-msdownload'), cbReject);
      expect(cbReject).toHaveBeenCalled();
      const err = cbReject.mock.calls[0][0];
      expect(err).toBeInstanceOf(BadRequestException);
    });

    it('should reject text/plain (.txt)', () => {
      filter(undefined, makeFile('text/plain'), cbReject);
      expect(cbReject).toHaveBeenCalled();
      const err = cbReject.mock.calls[0][0];
      expect(err).toBeInstanceOf(BadRequestException);
    });
  });

  describe('fileTypeFilter with ALLOWED_DOCUMENT_MIMES (documents)', () => {
    const filter = fileTypeFilter(ALLOWED_DOCUMENT_MIMES);

    it('should accept application/pdf for documents', () => {
      filter(undefined, makeFile('application/pdf'), cbOk);
      expect(cbOk).toHaveBeenCalledWith(null, true);
      expect(cbReject).not.toHaveBeenCalled();
    });

    it.each([
      ['image/jpeg', 'JPEG'],
      ['image/png', 'PNG'],
      ['image/webp', 'WebP'],
      ['image/avif', 'AVIF'],
    ])('should accept %s (%s)', (mime) => {
      filter(undefined, makeFile(mime), cbOk);
      expect(cbOk).toHaveBeenCalledWith(null, true);
      expect(cbReject).not.toHaveBeenCalled();
    });

    it('should reject application/x-msdownload (.exe) for documents', () => {
      filter(undefined, makeFile('application/x-msdownload'), cbReject);
      expect(cbReject).toHaveBeenCalled();
      const err = cbReject.mock.calls[0][0];
      expect(err).toBeInstanceOf(BadRequestException);
    });

    it('should reject text/plain (.txt) for documents', () => {
      filter(undefined, makeFile('text/plain'), cbReject);
      expect(cbReject).toHaveBeenCalled();
      const err = cbReject.mock.calls[0][0];
      expect(err).toBeInstanceOf(BadRequestException);
    });
  });
});
