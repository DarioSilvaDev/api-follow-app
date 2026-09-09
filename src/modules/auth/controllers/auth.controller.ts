import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response, Request } from 'express';
import { ThrottlerGuard } from '@nestjs/throttler';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../../common/types/auth.types';
import { LoginDto } from '../dto/login.dto';
import { RegisterDto } from '../dto/register.dto';
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
import { StopImpersonateHandler } from '../commands/stop-impersonate/stop-impersonate.handler';
import { JwtAuthGuard } from '../strategies/jwt-auth.guard';
import {
  accessTokenCookieOptions,
  refreshTokenCookieOptions,
  clearAccessTokenCookieOptions,
  clearRefreshTokenCookieOptions,
} from '../../../config/cookies.config';

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
    private readonly stopImpersonateHandler: StopImpersonateHandler,
  ) {}

  @Post('register')
  async register(@Body() dto: RegisterDto) {
    return this.registerHandler.execute(new RegisterCommand(dto));
  }

  @Post('login')
  // Wave P2 — B4: rate limit against credential brute force (D-001). Uses the
  // module-wide ttl/limit (envs THROTTLE_TTL/THROTTLE_LIMIT, default 10/60s).
  @UseGuards(ThrottlerGuard)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
    @Req() req: Request,
  ) {
    const result = await this.loginHandler.execute(
      new LoginCommand(dto),
      req.ip,
      req.headers['user-agent'],
    );

    res.cookie('access_token', result.accessToken, accessTokenCookieOptions);
    res.cookie('refresh_token', result.refreshToken, refreshTokenCookieOptions);

    return result.response;
  }

  @Post('refresh')
  // Wave P2 — B4: rate limit against refresh-token/impersonation abuse.
  @UseGuards(ThrottlerGuard)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = req.cookies?.refresh_token as string;
    if (!token) {
      throw new (await import('@nestjs/common')).UnauthorizedException(
        'Refresh token not found',
      );
    }

    const result = await this.refreshTokenHandler.execute(
      new RefreshTokenCommand(token),
      req.ip,
      req.headers['user-agent'],
    );

    res.cookie('access_token', result.accessToken, accessTokenCookieOptions);
    res.cookie('refresh_token', result.refreshToken, refreshTokenCookieOptions);

    return { success: true, impersonated: result.impersonated };
  }

  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = req.cookies?.refresh_token as string;

    if (token) {
      await this.logoutHandler.execute(new LogoutCommand(token));
    }

    res.cookie('access_token', '', clearAccessTokenCookieOptions);
    res.cookie('refresh_token', '', clearRefreshTokenCookieOptions);

    return { message: 'Session closed successfully' };
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
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangePasswordDto,
  ): Promise<void> {
    await this.changePasswordHandler.execute(user.id, dto);
  }

  @Post('forgot-password')
  // Wave P2 — B4: rate limit against email-bombing / enumeration abuse.
  @UseGuards(ThrottlerGuard)
  async forgotPassword(@Body() dto: RequestPasswordResetDto) {
    await this.requestPasswordResetHandler.execute(
      new RequestPasswordResetCommand(dto.email),
    );
  }

  @Post('reset-password')
  // Wave P2 — B4: rate limit against reset-token brute force.
  @UseGuards(ThrottlerGuard)
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.resetPasswordHandler.execute(
      new ResetPasswordCommand(dto.token, dto.password),
    );
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() user: AuthenticatedUser) {
    return this.getSessionHandler.execute(user.id, {
      impersonated: user.impersonated,
      impersonatedBy: user.impersonatedBy,
    });
  }

  @Post('stop-impersonate')
  @UseGuards(JwtAuthGuard)
  async stopImpersonate(
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (!user.impersonated || !user.impersonatedBy) {
      throw new (await import('@nestjs/common')).ForbiddenException(
        'Current session is not an impersonation',
      );
    }

    const result = await this.stopImpersonateHandler.execute(
      user.impersonatedBy,
      user.id,
    );

    res.cookie('access_token', result.adminToken, accessTokenCookieOptions);

    return { success: true };
  }
}
