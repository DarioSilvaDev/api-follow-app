import { User } from '@prisma/client';

export class UserResponseDto {
  id!: string;
  email!: string;
  firstName!: string;
  lastName!: string;
  phone!: string | null;
  avatarUrl!: string | null;
  language!: string;
  status!: string;
  emailVerifiedAt!: Date | null;
  createdAt!: Date | null;
  updatedAt!: Date | null;

  static from(user: User): UserResponseDto {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      avatarUrl: user.avatarUrl,
      language: user.language,
      status: user.status,
      emailVerifiedAt: user.emailVerifiedAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
