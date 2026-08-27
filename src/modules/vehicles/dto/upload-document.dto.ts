import { IsString, IsOptional, IsDateString } from 'class-validator';

export class UploadDocumentDto {
  @IsString()
  name!: string;

  @IsString()
  documentType!: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}
