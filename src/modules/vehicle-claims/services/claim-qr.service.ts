import { Injectable, Logger } from '@nestjs/common';
import * as QRCode from 'qrcode';
import { StorageR2Service } from '../../../common/storage/storage-r2.service';

/** Tamaño del PNG del QR (px). */
const QR_WIDTH = 512;
/** Carpeta de R2 donde viven los QR de reclamo. */
const QR_FOLDER = 'vehicle-claims/qr';

/**
 * ClaimQrService — genera el PNG del link de reclamo y lo persiste en R2.
 *
 * S-1/D-VC-10: el panel re-muestra la **imagen** (URL firmada) y nunca el
 * token. Un fallo de storage no bloquea la creación del invite: el link sigue
 * siendo válido y el panel muestra "QR no disponible".
 */
@Injectable()
export class ClaimQrService {
  private readonly logger = new Logger(ClaimQrService.name);

  constructor(private readonly storage: StorageR2Service) {}

  async generateAndUpload(
    inviteId: string,
    link: string,
  ): Promise<string | null> {
    try {
      const buffer = await QRCode.toBuffer(link, {
        type: 'png',
        width: QR_WIDTH,
        margin: 2,
        errorCorrectionLevel: 'M',
      });

      const file = {
        buffer,
        originalname: `vehicle-claim-${inviteId}.png`,
        mimetype: 'image/png',
      } as Express.Multer.File;

      const { key } = await this.storage.upload(file, QR_FOLDER);
      return key;
    } catch (error) {
      this.logger.warn(
        `No se pudo generar/subir el QR del invite ${inviteId}: ${String(error)}`,
      );
      return null;
    }
  }

  /** URL firmada del QR persistido; `null` si R2 no está disponible. */
  async signedUrl(key: string | null): Promise<string | null> {
    if (!key) return null;
    try {
      return await this.storage.getSignedUrl(key);
    } catch (error) {
      this.logger.warn(`No se pudo firmar el QR ${key}: ${String(error)}`);
      return null;
    }
  }
}
