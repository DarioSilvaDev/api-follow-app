import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Request } from 'express';
import { CommitClaimCommand } from '../commands/commit-claim/commit-claim.command';
import { CommitClaimHandler } from '../commands/commit-claim/commit-claim.handler';
import { VerifyClaimCommand } from '../commands/verify-claim/verify-claim.command';
import { VerifyClaimHandler } from '../commands/verify-claim/verify-claim.handler';
import { CommitClaimDto } from '../dto/commit-claim.dto';
import { VerifyClaimDto } from '../dto/verify-claim.dto';
import { GetClaimChallengeHandler } from '../queries/get-claim-challenge/get-claim-challenge.handler';
import { GetPublicClaimHandler } from '../queries/get-public-claim/get-public-claim.handler';
import { truncateIp } from '../utils/claim-input';

/**
 * VehicleClaimPublicController — API pública del reclamo (sin `JwtAuthGuard`).
 *
 * Throttle explícito por ruta (D-TL-C1/S-3). El bucket de módulo
 * `vehicleClaimToken` queda en 5/300s; el bootstrap lo sobreescribe a 10/60s.
 * El guard resuelve la key por clase+método+bucket, así que no hay cuota
 * compartida entre challenge/verify/commit.
 *
 * El commit resuelve la sesión del cookie `access_token` sin lanzar: el handler
 * responde 401 `AUTH_REQUIRED` para que el frontend redirija preservando el
 * token (F-10).
 */
@Controller('vehicle-claims/public')
export class VehicleClaimPublicController {
  constructor(
    private readonly getPublicClaimHandler: GetPublicClaimHandler,
    private readonly getClaimChallengeHandler: GetClaimChallengeHandler,
    private readonly verifyClaimHandler: VerifyClaimHandler,
    private readonly commitClaimHandler: CommitClaimHandler,
    private readonly jwtService: JwtService,
  ) {}

  @Get(':token')
  @Throttle({
    default: { limit: 10, ttl: 60_000 },
    vehicleClaimToken: { limit: 10, ttl: 60_000 },
  })
  @UseGuards(ThrottlerGuard)
  getPublic(@Param('token') token: string) {
    return this.getPublicClaimHandler.execute(token);
  }

  @Get(':token/challenge')
  @Throttle({
    default: { limit: 10, ttl: 60_000 },
    vehicleClaimToken: { limit: 5, ttl: 300_000 },
  })
  @UseGuards(ThrottlerGuard)
  challenge(
    @Param('token') token: string,
    @Query('licensePlate') licensePlate?: string,
  ) {
    return this.getClaimChallengeHandler.execute(token, licensePlate);
  }

  @Post(':token/verify')
  @Throttle({
    default: { limit: 5, ttl: 300_000 },
    vehicleClaimToken: { limit: 5, ttl: 300_000 },
  })
  @UseGuards(ThrottlerGuard)
  verify(
    @Param('token') token: string,
    @Body() dto: VerifyClaimDto,
    @Req() req: Request,
  ) {
    return this.verifyClaimHandler.execute(
      new VerifyClaimCommand(
        token,
        dto,
        truncateIp(req.ip),
        this.resolveUserAgent(req),
      ),
    );
  }

  @Post(':token/commit')
  @Throttle({
    default: { limit: 5, ttl: 300_000 },
    vehicleClaimToken: { limit: 5, ttl: 300_000 },
  })
  @UseGuards(ThrottlerGuard)
  commit(
    @Param('token') token: string,
    @Body() dto: CommitClaimDto,
    @Req() req: Request,
  ) {
    return this.commitClaimHandler.execute(
      new CommitClaimCommand(token, dto, this.resolveSessionUserId(req)),
    );
  }

  /** Igual que el wizard: nunca lanza si el cookie falta o venció. */
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

  private resolveUserAgent(req: Request): string | null {
    const raw = req.headers['user-agent'];
    if (typeof raw !== 'string' || raw.length === 0) return null;
    return raw.slice(0, 300);
  }
}
