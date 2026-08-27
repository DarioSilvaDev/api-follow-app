import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuid } from 'uuid';
import sharp from 'sharp';
import { envs } from '../../config/envs';
import type { StorageService } from './storage.service';

@Injectable()
export class StorageR2Service implements StorageService {
  private readonly logger = new Logger(StorageR2Service.name);
  private readonly client: S3Client | null;
  private readonly bucket: string;
  private readonly isImage = (mime: string) =>
    ['image/jpeg', 'image/png', 'image/webp', 'image/avif'].includes(mime);

  constructor() {
    this.bucket = envs.R2_BUCKET ?? '';
    if (
      envs.R2_REGION &&
      envs.R2_ENDPOINT &&
      envs.R2_ACCESS_KEY_ID &&
      envs.R2_SECRET_ACCESS_KEY
    ) {
      this.client = new S3Client({
        region: envs.R2_REGION || 'auto',
        endpoint: envs.R2_ENDPOINT,
        credentials: {
          accessKeyId: envs.R2_ACCESS_KEY_ID,
          secretAccessKey: envs.R2_SECRET_ACCESS_KEY,
        },
      });
    } else {
      this.client = null;
      this.logger.warn('R2 not configured, storage operations will fail');
    }
  }

  async upload(
    file: Express.Multer.File,
    folder: string,
  ): Promise<{ key: string; url: string }> {
    if (!this.client) {
      throw new BadRequestException('Storage not configured');
    }

    const ext = file.originalname.split('.').pop()?.toLowerCase() ?? 'bin';
    const key = `${folder}/${uuid()}.${this.isImage(file.mimetype) ? 'webp' : ext}`;
    let buffer: Buffer = file.buffer;

    if (this.isImage(file.mimetype)) {
      try {
        buffer = await sharp(buffer)
          .resize(1920, 1920, { fit: 'inside', withoutEnlargement: true })
          .webp({ quality: 80 })
          .toBuffer();
      } catch (err) {
        this.logger.warn(`Sharp processing failed, using raw file: ${err}`);
      }
    }

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: this.isImage(file.mimetype) ? 'image/webp' : file.mimetype,
      }),
    );

    return { key, url: key };
  }

  async delete(key: string): Promise<void> {
    if (!this.client) {
      throw new BadRequestException('Storage not configured');
    }

    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );
  }

  async getSignedUrl(
    key: string,
    expiresIn = envs.SIGNED_URL_EXPIRES_SECONDS,
  ): Promise<string> {
    if (!this.client) {
      throw new BadRequestException('Storage not configured');
    }

    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });
    return getSignedUrl(this.client, command, { expiresIn });
  }
}
