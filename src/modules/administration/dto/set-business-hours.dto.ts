import {
  IsInt,
  IsString,
  Min,
  Max,
  IsArray,
  ValidateNested,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';

class BusinessHourItem {
  @IsInt()
  @Min(0)
  @Max(6)
  weekday!: number;

  @IsString()
  opensAt!: string;

  @IsString()
  closesAt!: string;
}

export class SetBusinessHoursDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => BusinessHourItem)
  hours!: BusinessHourItem[];
}
