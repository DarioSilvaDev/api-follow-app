import {
  ConflictException,
  Injectable,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../../../common/database/prisma.service';
import { ALIAS_COOLDOWN_DAYS } from '../../constants/alias.constants';
import { UpdateMyAliasDto } from '../../dto/update-my-alias.dto';
import {
  GetMyAliasHandler,
  type MyAliasResponse,
} from '../../queries/get-my-alias/get-my-alias.handler';

/**
 * Fase 2 (D-077 / D-091): PATCH /users/me/alias.
 *
 * Reglas de negocio (spec §5.2, §6.5 y D-091):
 * - Formato validado en el DTO (400): `^[a-zA-Z0-9._-]{3,30}$` aceptando
 *   mayúsculas (AC §10: `"Juan-9"` → persiste `juan-9`).
 * - Normalización server-side a lowercase antes de persistir.
 * - Unicidad case-insensitive → 409 "El alias ya está en uso".
 * - Cooldown 15 días → 409 con fecha de liberación. La ALTA INICIAL es
 *   gratuita; cualquier otra mutación (cambiar, eliminar, o re-clamar
 *   después de haber eliminado) respeta el cooldown.
 * - `{ alias: "mismo-valor-actual" }` (no-null) → 200 no-op sin cooldown.
 * - `{ alias: null }` cuando ya no hay alias → no-op; dentro de cooldown
 *   tras una eliminación reciente responde 409 (AC §10 / regla §6.5).
 * - Inmutabilidad con transferencia pending (D-077) → 409.
 */
@Injectable()
export class UpdateMyAliasHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly getMyAliasHandler: GetMyAliasHandler,
  ) {}

  async execute(
    userId: string,
    dto: UpdateMyAliasDto,
  ): Promise<MyAliasResponse> {
    // Cuerpo sin `alias` (`{}`) → no-op: devuelve el estado actual.
    if (dto.alias === undefined) {
      return this.getMyAliasHandler.execute(userId);
    }

    const normalized =
      typeof dto.alias === 'string'
        ? dto.alias.trim().toLowerCase()
        : null;

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, alias: true, lastAliasChangedAt: true },
    });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    const now = new Date();
    const cooldownWindow = new Date(
      now.getTime() - ALIAS_COOLDOWN_DAYS * 24 * 60 * 60 * 1000,
    );
    const inCooldown =
      !!user.lastAliasChangedAt && user.lastAliasChangedAt > cooldownWindow;

    // D-091: reenviar EXACTAMENTE el alias no-null vigente → no-op exitoso,
    // sin tocar cooldown ni pendencia (spec §5.2 nota; AC §10).
    if (user.alias !== null && normalized === user.alias) {
      return this.getMyAliasHandler.execute(userId);
    }

    // No-op "eliminar" cuando ya no hay alias. Dentro de cooldown tras una
    // eliminación reciente → 409 (AC §10 / regla §6.5); fuera de cooldown →
    // 200 sin escribir nada (evita sellar un timestamp de cooldown espurio).
    if (user.alias === null && normalized === null) {
      if (inCooldown) {
        throw this.cooldownException(user.lastAliasChangedAt!);
      }
      return this.getMyAliasHandler.execute(userId);
    }

    // D-077: un alias ya definido es inmutable mientras el usuario sea
    // fromUser o toUser de una transferencia pending (bloquea cambio y
    // eliminación). El alta inicial no aplica (sin alias previo la
    // contraparte ve nombre completo, no hay identidad congelada).
    if (user.alias !== null) {
      const pending = await this.prisma.vehicleTransfer.findFirst({
        where: {
          status: 'pending',
          OR: [{ fromUserId: userId }, { toUserId: userId }],
        },
        select: { id: true },
      });
      if (pending) {
        throw new ConflictException(
          'Tu alias no puede cambiarse mientras tengas una transferencia pendiente',
        );
      }
    }

    // D-091: cooldown para toda mutación EXCEPTO el alta inicial
    // (primer alias de la historia del usuario, lastAliasChangedAt null).
    const isInitialGrant = user.lastAliasChangedAt === null;
    if (!isInitialGrant && inCooldown) {
      throw this.cooldownException(user.lastAliasChangedAt!);
    }

    // Unicidad case-insensitive: pre-check amigable (el índice funcional
    // LOWER(alias) respalda el invariante ante carreras, spec §5.1).
    if (normalized !== null) {
      const existing = await this.prisma.user.findUnique({
        where: { alias: normalized },
        select: { id: true },
      });
      if (existing && existing.id !== userId) {
        throw new ConflictException('El alias ya está en uso');
      }
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        alias: normalized,
        // Toda mutación sellada (cambiar/eliminar/re-clamar) actualiza el
        // timestamp del cooldown. Los no-ops retornaron arriba.
        lastAliasChangedAt: now,
      },
    });

    return this.getMyAliasHandler.execute(userId);
  }

  private cooldownException(
    lastAliasChangedAt: Date,
  ): ConflictException {
    const nextChangeAllowedAt = new Date(
      lastAliasChangedAt.getTime() +
        ALIAS_COOLDOWN_DAYS * 24 * 60 * 60 * 1000,
    );
    const isoDate = nextChangeAllowedAt.toISOString().split('T')[0];
    return new ConflictException(
      `Solo podés cambiar tu alias cada ${ALIAS_COOLDOWN_DAYS} días. Podés cambiarlo el ${isoDate}`,
    );
  }
}