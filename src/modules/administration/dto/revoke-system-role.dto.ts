import { IsUUID } from 'class-validator';

export class RevokeSystemRoleDto {
  @IsUUID()
  userId!: string;

  @IsUUID()
  roleId!: string;
}
