import { IsBoolean } from 'class-validator';

export class UpdateWorkshopStatusDto {
  @IsBoolean()
  isActive!: boolean;
}
