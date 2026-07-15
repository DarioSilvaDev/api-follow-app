import { UserSession, PasswordReset } from '@prisma/client';

export interface AuthRepository {
  createSession(data: {
    userId: string;
    refreshToken: string;
    expiresAt: Date;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<UserSession>;

  findSessionByRefreshToken(refreshToken: string): Promise<UserSession | null>;

  revokeSession(id: string): Promise<void>;

  revokeUserSessions(userId: string): Promise<void>;

  createPasswordReset(data: {
    userId: string;
    token: string;
    expiresAt: Date;
  }): Promise<PasswordReset>;

  findPasswordResetByToken(token: string): Promise<PasswordReset | null>;

  markPasswordResetUsed(id: string): Promise<void>;
}
