import { Type } from 'class-transformer';
import {
  IsEmail,
  IsString,
  MinLength,
  MaxLength,
  ValidateNested,
} from 'class-validator';

/**
 * Celular de la cuenta (D-173, obligatorio en el alta):
 * dos inputs separados (área + número), sin longitud fija. El país lo fija
 * `DEFAULT_PHONE_COUNTRY_CODE` en el servidor; nunca se acepta del body.
 */
export class RegisterPhoneDto {
  @IsString()
  @MaxLength(6)
  areaCode!: string;

  @IsString()
  @MaxLength(12)
  nationalNumber!: string;
}

export class RegisterDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  firstName!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  lastName!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(100)
  password!: string;

  @ValidateNested()
  @Type(() => RegisterPhoneDto)
  phone!: RegisterPhoneDto;
}
