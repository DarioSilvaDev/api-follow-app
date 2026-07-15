import { UserResponseDto } from '../../users/dto/user-response.dto';

export class AuthResponseDto {
  user!: UserResponseDto;
  accessToken!: string;
  refreshToken!: string;

  static from(
    user: UserResponseDto,
    accessToken: string,
    refreshToken: string,
  ): AuthResponseDto {
    return { user, accessToken, refreshToken };
  }
}
