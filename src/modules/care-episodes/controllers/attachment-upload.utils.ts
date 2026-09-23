import { BadRequestException } from '@nestjs/common';
import {
  ALLOWED_IMAGE_MIMES,
  fileTypeFilter,
} from '../../vehicles/controllers/file-upload.utils';

/**
 * Mensaje estable para rechazo de MIME en evidencia (S4).
 */
export const EVIDENCE_MIME_ERROR_MESSAGE =
  'Formato no permitido. Usa JPG, PNG, WebP o AVIF';

/**
 * evidenceFileFilter — REUTILIZA fileTypeFilter(ALLOWED_IMAGE_MIMES) de
 * vehicles (decisión E-2: importar, no mover) y mapea el rechazo al mensaje
 * definido en el diseño S4. Mantiene el BadRequestException (400) del filtro
 * base; el diseño admite 415/400.
 */
export const evidenceFileFilter: (
  _req: unknown,
  file: Express.Multer.File,
  cb: (error: Error | null, acceptFile: boolean) => void,
) => void = (req, file, cb) => {
  const base = fileTypeFilter(ALLOWED_IMAGE_MIMES);
  base(req, file, (err, accept) => {
    if (err) {
      cb(new BadRequestException(EVIDENCE_MIME_ERROR_MESSAGE), false);
      return;
    }
    cb(null, accept);
  });
};