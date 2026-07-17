import { UserResponseDto } from '../../users/dto/user-response.dto';

export class AuthResponseDto {
  user!: UserResponseDto;
  accessToken?: string | null;
  refreshToken?: string | null;

  static from(
    user: UserResponseDto,
    accessToken?: string | null,
    refreshToken?: string | null,
  ): AuthResponseDto {
    return {
      user,
      accessToken: accessToken,
      refreshToken: refreshToken,
    };
  }
}
