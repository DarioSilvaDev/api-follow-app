import {
  IsString,
  MaxLength,
  IsOptional,
  IsInt,
  IsArray,
} from 'class-validator';

export class CreateRoleDto {
  @IsString()
  @MaxLength(50)
  code!: string;

  @IsString()
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  priority?: number;

  @IsArray()
  @IsString({ each: true })
  permissionCodes!: string[];
}
