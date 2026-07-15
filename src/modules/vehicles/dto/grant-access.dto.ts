import { IsUUID, IsOptional, IsArray } from 'class-validator';

export class GrantAccessDto {
  @IsUUID()
  userId!: string;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  permissionIds?: string[];
}
