import { PartialType } from '@nestjs/mapped-types';
import { CreateWorkshopDto } from './create-workshop.dto';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateWorkshopDto extends PartialType(CreateWorkshopDto) {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;
}
