import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { LoginDto } from '../dto/login.dto';
import { RegisterDto } from '../dto/register.dto';
import { RefreshTokenDto } from '../dto/refresh-token.dto';
import { VerifyEmailDto } from '../dto/verify-email.dto';
import { ResendVerificationDto } from '../dto/resend-verification.dto';
import { ChangePasswordDto } from '../dto/change-password.dto';
import { RequestPasswordResetDto } from '../dto/request-password-reset.dto';
import { ResetPasswordDto } from '../dto/reset-password.dto';
import { RegisterCommand } from '../commands/register/register.command';
import { RegisterHandler } from '../commands/register/register.handler';
import { LoginCommand } from '../commands/login/login.command';
import { LoginHandler } from '../commands/login/login.handler';
import { RefreshTokenCommand } from '../commands/refresh-token/refresh-token.command';
import { RefreshTokenHandler } from '../commands/refresh-token/refresh-token.handler';
import { LogoutCommand } from '../commands/logout/logout.command';
import { LogoutHandler } from '../commands/logout/logout.handler';
import { VerifyEmailHandler } from '../commands/verify-email/verify-email.handler';
import { ResendVerificationHandler } from '../commands/resend-verification/resend-verification.handler';
import { ChangePasswordHandler } from '../commands/change-password/change-password.handler';
import { RequestPasswordResetCommand } from '../commands/request-password-reset/request-password-reset.command';
import { RequestPasswordResetHandler } from '../commands/request-password-reset/request-password-reset.handler';
import { ResetPasswordCommand } from '../commands/reset-password/reset-password.command';
import { ResetPasswordHandler } from '../commands/reset-password/reset-password.handler';
import { GetSessionHandler } from '../queries/get-session/get-session.handler';
import { JwtAuthGuard } from '../strategies/jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly registerHandler: RegisterHandler,
    private readonly loginHandler: LoginHandler,
    private readonly refreshTokenHandler: RefreshTokenHandler,
    private readonly logoutHandler: LogoutHandler,
    private readonly verifyEmailHandler: VerifyEmailHandler,
    private readonly resendVerificationHandler: ResendVerificationHandler,
    private readonly changePasswordHandler: ChangePasswordHandler,
    private readonly requestPasswordResetHandler: RequestPasswordResetHandler,
    private readonly resetPasswordHandler: ResetPasswordHandler,
    private readonly getSessionHandler: GetSessionHandler,
  ) {}

  @Post('register')
  async register(@Body() dto: RegisterDto) {
    return this.registerHandler.execute(new RegisterCommand(dto));
  }

  @Post('login')
  async login(@Body() dto: LoginDto) {
    return this.loginHandler.execute(new LoginCommand(dto));
  }

  @Post('refresh')
  async refresh(@Body() dto: RefreshTokenDto) {
    return this.refreshTokenHandler.execute(
      new RefreshTokenCommand(dto.refreshToken),
    );
  }

  @Post('logout')
  async logout(@Body() dto: RefreshTokenDto) {
    await this.logoutHandler.execute(new LogoutCommand(dto.refreshToken));
  }

  @Get('verify-email')
  async verifyEmail(@Query() dto: VerifyEmailDto): Promise<string> {
    return this.verifyEmailHandler.execute(dto);
  }

  @Post('resend-verification')
  async resendVerification(@Body() dto: ResendVerificationDto): Promise<void> {
    await this.resendVerificationHandler.execute(dto);
  }

  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  async changePassword(
    @Req() req: any,
    @Body() dto: ChangePasswordDto,
  ): Promise<void> {
    await this.changePasswordHandler.execute(req.user.id, dto);
  }

  @Post('forgot-password')
  async forgotPassword(@Body() dto: RequestPasswordResetDto) {
    await this.requestPasswordResetHandler.execute(
      new RequestPasswordResetCommand(dto.email),
    );
  }

  @Post('reset-password')
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.resetPasswordHandler.execute(
      new ResetPasswordCommand(dto.token, dto.password),
    );
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@Req() req: any) {
    return this.getSessionHandler.execute(req.user.id);
  }
}
