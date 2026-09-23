import { BadRequestException } from '@nestjs/common';
import {
  EVIDENCE_MIME_ERROR_MESSAGE,
  evidenceFileFilter,
} from './attachment-upload.utils';

/**
 * attachment-upload.utils — filtro MIME de evidencias (S4).
 * Reutiliza fileTypeFilter(ALLOWED_IMAGE_MIMES) del módulo vehicles con
 * mensaje propio en español para JPG/PNG/WebP/AVIF.
 */
describe('evidenceFileFilter — S4 evidence MIME filter', () => {
  const done = jest.fn();

  it.each([
    ['image/jpeg', 'foto.jpg'],
    ['image/png', 'foto.png'],
    ['image/webp', 'foto.webp'],
    ['image/avif', 'foto.avif'],
  ])('acepta %s', (mimeType, originalname) => {
    const file = { originalname, mimetype: mimeType } as Express.Multer.File;
    evidenceFileFilter({} as any, file, done);
    expect(done).toHaveBeenCalledWith(null, true);
  });

  it('rechaza image/gif (no está en ALLOWED_IMAGE_MIMES)', () => {
    done.mockClear();
    const file = { originalname: 'foto.gif', mimetype: 'image/gif' } as Express.Multer.File;
    evidenceFileFilter({} as any, file, done);
    expect(done).toHaveBeenCalledWith(expect.any(BadRequestException), false);
    expect(
      (done.mock.calls[0][0] as BadRequestException).message,
    ).toBe(EVIDENCE_MIME_ERROR_MESSAGE);
  });

  it('rechaza application/pdf con el mensaje de evidencia', () => {
    done.mockClear();
    const file = {
      originalname: 'factura.pdf',
      mimetype: 'application/pdf',
    } as Express.Multer.File;
    evidenceFileFilter({} as any, file, done);
    expect(done).toHaveBeenCalledWith(expect.any(BadRequestException), false);
    expect((done.mock.calls[0][0] as BadRequestException).status).toBe(400);
    expect(
      (done.mock.calls[0][0] as BadRequestException).message,
    ).toBe('Formato no permitido. Usa JPG, PNG, WebP o AVIF');
  });
});