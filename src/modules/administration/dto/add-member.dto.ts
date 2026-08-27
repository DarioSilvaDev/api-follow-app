import { IsEmail, IsUUID } from 'class-validator';

export class AddMemberDto {
  @IsEmail()
  email!: string;

  @IsUUID()
  roleId!: string;
}
