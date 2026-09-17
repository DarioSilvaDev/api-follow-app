import { BadRequestException } from '@nestjs/common';

/**
 * Allowed MIME types for vehicle uploads (Wave P2 — B3).
 *
 * Photos: image formats only (consistent with StorageR2Service.isImage, which
 * re-encodes these to WebP via sharp).
 * Documents: the same image formats plus PDF.
 *
 * The filter runs at the multer boundary (FileInterceptor.fileFilter), BEFORE
 * the file reaches storage, and rejects other Content-Types with a 400.
 */
export const ALLOWED_IMAGE_MIMES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
];

export const ALLOWED_DOCUMENT_MIMES = [
  ...ALLOWED_IMAGE_MIMES,
  'application/pdf',
];

/**
 * Multer fileFilter factory: rejects files whose mimetype is not in the
 * provided allowlist.
 */
export function fileTypeFilter(allowedMimes: string[]) {
  return (
    _req: unknown,
    file: Express.Multer.File,
    cb: (error: Error | null, acceptFile: boolean) => void,
  ) => {
    if (!allowedMimes.includes(file.mimetype)) {
      cb(
        new BadRequestException(
          `Unsupported file type: ${file.mimetype}. Allowed: ${allowedMimes.join(', ')}`,
        ),
        false,
      );
      return;
    }
    cb(null, true);
  };
}
