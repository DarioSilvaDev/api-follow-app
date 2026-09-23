import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { UserWizardClaimDto } from '../dto/user-wizard-claim.dto';
import { UserWizardValidationHandler } from '../queries/wizard-validation/wizard-validation.handler';
import { UserWizardClaimCommand } from '../commands/wizard-claim/wizard-claim.command';
import { UserWizardClaimHandler } from '../commands/wizard-claim/wizard-claim.handler';

/**
 * D-106: wizard público de usuario de plataforma.
 *
 * SIN JwtAuthGuard a nivel de clase: el wizard opera sobre un token de
 * invitación one-shot. La sesión (opcional) se resuelve del cookie
 * `access_token` solo por paridad de firma con el wizard de workshops/
 * dealerships; en este flujo active/suspended → 409, así que el handler no
 * ramifica por sesión (se conserva en el comando por uniformidad).
 */
@Controller('users/wizard')
export class UserWizardController {
  constructor(
    private readonly wizardValidationHandler: UserWizardValidationHandler,
    private readonly wizardClaimHandler: UserWizardClaimHandler,
    private readonly jwtService: JwtService,
  ) {}

  @Get('invitations/:token')
  // SC-3: throttle sobre el GET público del preview (evita enumeración/abuso
  // del token). 10 req/60s por IP (mismo default global del módulo).
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @UseGuards(ThrottlerGuard)
  async validate(@Param('token') token: string) {
    return this.wizardValidationHandler.execute(token);
  }

  @Post('claim')
  // SC-3: rate limit estricto — el claim puede crear cuentas. Mismo patrón
  // que reset-password (5 req / 300s por IP).
  @Throttle({ default: { limit: 5, ttl: 300000 } })
  @UseGuards(ThrottlerGuard)
  async claim(@Body() dto: UserWizardClaimDto, @Req() req: Request) {
    const sessionUserId = this.resolveSessionUserId(req);
    return this.wizardClaimHandler.execute(
      new UserWizardClaimCommand(dto, sessionUserId),
    );
  }

  /**
   * Resuelve la sesión del cookie `access_token` sin fallar si no existe o
   * está vencida. Nunca lanza: el handler decide el error correcto.
   */
  private resolveSessionUserId(req: Request): string | null {
    const token = req.cookies?.access_token as string | undefined;
    if (!token) return null;
    try {
      const payload = this.jwtService.verify<{ sub?: string }>(token);
      return payload.sub ?? null;
    } catch {
      return null;
    }
  }
}
