import { IsString, IsOptional, MaxLength, IsEmail, IsUrl } from 'class-validator';

export class CreateDealershipDto {
  @IsString()
  @MaxLength(150)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  legalName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  taxId?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @IsOptional()
  @IsString()
  @IsUrl({ require_protocol: false })
  website?: string;

  @IsOptional()
  @IsString()
  @IsUrl({ require_protocol: false })
  logoUrl?: string;

  @IsOptional()
  @IsString()
  description?: string;
}