import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { v4 as uuid } from 'uuid';
import sharp from 'sharp';
import { envs } from '../../config/envs';
import type { StorageService } from './storage.service';

@Injectable()
export class StorageB2Service implements StorageService {
  private readonly logger = new Logger(StorageB2Service.name);
  private readonly client: S3Client | null;
  private readonly bucket: string;
  private readonly publicUrl: string;
  private readonly isImage = (mime: string) =>
    ['image/jpeg', 'image/png', 'image/webp', 'image/avif'].includes(mime);

  constructor() {
    this.bucket = envs.B2_BUCKET ?? '';
    this.publicUrl = envs.B2_PUBLIC_URL ?? '';
    if (
      envs.B2_REGION &&
      envs.B2_ENDPOINT &&
      envs.B2_KEY_ID &&
      envs.B2_APP_KEY
    ) {
      this.client = new S3Client({
        region: envs.B2_REGION,
        endpoint: envs.B2_ENDPOINT,
        credentials: {
          accessKeyId: envs.B2_KEY_ID,
          secretAccessKey: envs.B2_APP_KEY,
        },
      });
    } else {
      this.client = null;
      this.logger.warn('B2 not configured, storage operations will fail');
    }
  }

  async upload(
    file: Express.Multer.File,
    folder: string,
  ): Promise<{ key: string; url: string }> {
    if (!this.client) {
      throw new BadRequestException('B2 Storage not configured');
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

    return { key, url: `${this.publicUrl}/${key}` };
  }

  async delete(key: string): Promise<void> {
    if (!this.client) {
      throw new BadRequestException('B2 Storage not configured');
    }

    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );
  }
}
