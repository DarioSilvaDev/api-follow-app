import { UserResponseDto } from '../../users/dto/user-response.dto';

export class AuthResponseDto {
  user!: UserResponseDto;

  static from(user: UserResponseDto): AuthResponseDto {
    return { user };
  }
}
