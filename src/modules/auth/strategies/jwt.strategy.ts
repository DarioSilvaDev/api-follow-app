import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Request } from 'express';
import { envs } from '../../../config/envs';
import { PrismaService } from '../../../common/database/prisma.service';
import {
  ImpersonationExpiredException,
  SessionExpiredException,
} from '../../../common/exceptions/coded.exception';

interface JwtPayload {
  sub: string;
  impersonated?: boolean;
  impersonatedBy?: string;
  exp?: number;
}

/**
 * JwtStrategy — D-016 A1:
 * - ignoreExpiration: true (HS256 signature is still verified)
 * - If exp is in the past: impersonated → ImpersonationExpiredException; else → SessionExpiredException
 * - Then continues with normal user active check (no alteration)
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        (req: Request) => req?.cookies?.access_token ?? null,
      ]),
      ignoreExpiration: true,
      secretOrKey: envs.JWT_SECRET,
    });
  }

  async validate(payload: JwtPayload) {
    // D-016 A1: Check expiration manually
    if (payload.exp) {
      const nowEpochSeconds = Math.floor(Date.now() / 1000);
      if (payload.exp < nowEpochSeconds) {
        if (payload.impersonated) {
          throw new ImpersonationExpiredException();
        }
        throw new SessionExpiredException();
      }
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, status: true },
    });

    if (!user || user.status !== 'active') {
      throw new SessionExpiredException();
    }

    return {
      id: user.id,
      email: user.email,
      impersonated: payload.impersonated,
      impersonatedBy: payload.impersonatedBy,
    };
  }
}
