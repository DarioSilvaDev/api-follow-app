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
import { WizardClaimDto } from '../dto/wizard-claim.dto';
import { WizardValidationHandler } from '../queries/wizard-validation/wizard-validation.handler';
import { WizardClaimCommand } from '../commands/wizard-claim/wizard-claim.command';
import { WizardClaimHandler } from '../commands/wizard-claim/wizard-claim.handler';

/**
 * D-106: wizard público de onboarding de taller.
 *
 * SIN JwtAuthGuard a nivel de clase: el wizard opera sobre un token de
 * invitación UUID (one-shot). La autorización se valida en el handler contra
 * el email de la invitación. La sesión (opcional) se resuelve del cookie
 * `access_token` para el flujo "cuenta ya activa": si el token no existe o
 * está vencido, se trata como sesión ausente y el handler responde
 * 401 AUTH_REQUIRED (el frontend redirige a login preservando el token).
 */
@Controller('workshops/wizard')
export class WizardController {
  constructor(
    private readonly wizardValidationHandler: WizardValidationHandler,
    private readonly wizardClaimHandler: WizardClaimHandler,
    private readonly jwtService: JwtService,
  ) {}

  @Get('invitations/:token')
  // SC-3: throttle sobre el GET público del preview (evita enumeración/abuso
  // del token). 10 req/60s por IP (mismo default global del módulo), fijado
  // explícitamente para que quede acotado a este endpoint.
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @UseGuards(ThrottlerGuard)
  async validate(@Param('token') token: string) {
    return this.wizardValidationHandler.execute(token);
  }

  @Post('claim')
  // SC-3: rate limit estricto — el claim puede crear cuentas / vincular
  // sesiones. Mismo patrón que reset-password en AuthController
  // (5 req / 300s por IP) para proteger contra fuerza bruta del token.
  @Throttle({ default: { limit: 5, ttl: 300000 } })
  @UseGuards(ThrottlerGuard)
  async claim(@Body() dto: WizardClaimDto, @Req() req: Request) {
    const sessionUserId = this.resolveSessionUserId(req);
    return this.wizardClaimHandler.execute(
      new WizardClaimCommand(dto, sessionUserId),
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