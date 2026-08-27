import {
  IsString,
  IsOptional,
  IsBoolean,
  MaxLength,
  IsUUID,
} from 'class-validator';

export class UpdateModelDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsUUID()
  brandId?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
