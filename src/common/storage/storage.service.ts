export interface StorageService {
  upload(
    file: Express.Multer.File,
    folder: string,
  ): Promise<{ key: string; url: string }>;
  delete(key: string): Promise<void>;
  getSignedUrl?(key: string, expiresIn?: number): Promise<string>;
}
