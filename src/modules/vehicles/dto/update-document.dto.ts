import { IsString, IsOptional, IsDateString } from 'class-validator';

export class UpdateDocumentDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  documentType?: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}
