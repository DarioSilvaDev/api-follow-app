import { IsString, Matches } from 'class-validator';

export class ValidatePasswordResetTokenDto {
  // El token crudo de reset es randomBytes(32).toString('hex') → 64 chars hex.
  @IsString()
  @Matches(/^[a-f0-9]{64}$/, {
    message: 'token must be a 64-character lowercase hex string',
  })
  token!: string;
}
