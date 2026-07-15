import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { envs } from '../../config/envs';
import { UsersModule } from '../users/users.module';
import { AuthController } from './controllers/auth.controller';
import { PrismaAuthRepository } from './repositories/prisma-auth.repository';
import { AUTH_REPOSITORY } from './tokens';
import { RegisterHandler } from './commands/register/register.handler';
import { LoginHandler } from './commands/login/login.handler';
import { RefreshTokenHandler } from './commands/refresh-token/refresh-token.handler';
import { LogoutHandler } from './commands/logout/logout.handler';
import { RequestPasswordResetHandler } from './commands/request-password-reset/request-password-reset.handler';
import { ResetPasswordHandler } from './commands/reset-password/reset-password.handler';
import { GetSessionHandler } from './queries/get-session/get-session.handler';
import { SendPasswordResetEmailListener } from './listeners/send-password-reset-email.listener';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    UsersModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({
      secret: envs.JWT_SECRET,
      signOptions: { expiresIn: parseInt(envs.JWT_ACCESS_EXPIRES_IN) },
    }),
  ],
  controllers: [AuthController],
  providers: [
    RegisterHandler,
    LoginHandler,
    RefreshTokenHandler,
    LogoutHandler,
    RequestPasswordResetHandler,
    ResetPasswordHandler,
    GetSessionHandler,
    SendPasswordResetEmailListener,
    JwtStrategy,
    { provide: AUTH_REPOSITORY, useClass: PrismaAuthRepository },
  ],
})
export class AuthModule {}
