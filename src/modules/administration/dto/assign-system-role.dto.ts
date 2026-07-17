import { IsEnum, IsUUID } from 'class-validator';
import { SystemRoleType } from '@prisma/client';

export class AssignSystemRoleDto {
  @IsUUID()
  userId!: string;

  @IsEnum(SystemRoleType)
  roleType!: SystemRoleType;
}
