import { IsString, MaxLength, IsOptional } from 'class-validator';

export class CreateSpecialtyDto {
  @IsString()
  @MaxLength(50)
  code!: string;

  @IsString()
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;
}
