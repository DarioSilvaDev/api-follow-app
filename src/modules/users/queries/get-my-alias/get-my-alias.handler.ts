import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../common/database/prisma.service';
import { ALIAS_COOLDOWN_DAYS } from '../../constants/alias.constants';

export interface MyAliasResponse {
  alias: string | null;
  lastAliasChangedAt: Date | null;
  nextChangeAllowedAt: Date | null;
}

/**
 * Fase 2 (D-077 / D-091): GET /users/me/alias.
 * Responde el alias del usuario autenticado + la fecha en que podrá
 * cambiarlo nuevamente (lastAliasChangedAt + 15 días; null si no hay alias).
 */
@Injectable()
export class GetMyAliasHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(userId: string): Promise<MyAliasResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { alias: true, lastAliasChangedAt: true },
    });

    if (!user) {
      return { alias: null, lastAliasChangedAt: null, nextChangeAllowedAt: null };
    }

    const nextChangeAllowedAt =
      user.alias && user.lastAliasChangedAt
        ? new Date(
            user.lastAliasChangedAt.getTime() +
              ALIAS_COOLDOWN_DAYS * 24 * 60 * 60 * 1000,
          )
        : null;

    return {
      alias: user.alias,
      lastAliasChangedAt: user.lastAliasChangedAt,
      nextChangeAllowedAt,
    };
  }
}