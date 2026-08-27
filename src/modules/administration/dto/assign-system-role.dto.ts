import { IsUUID } from 'class-validator';

export class AssignSystemRoleDto {
  @IsUUID()
  userId!: string;

  @IsUUID()
  roleId!: string;
}
