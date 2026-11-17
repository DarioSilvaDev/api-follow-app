import {
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../../../common/database/prisma.service';
import { NotFoundException } from '../../../../common/exceptions/not-found.exception';
import { CareEpisodeRejectedEvent } from '../../events/care-episode-rejected.event';
import { RejectCareEpisodeCommand } from './reject-care-episode.command';

/**
 * RejectCareEpisodeHandler — Rechazo de un registro del propietario
 * (RF-9 / D-202..D-205). Espejo exacto de `VerifyCareEpisodeHandler`.
 *
 * Atomicidad: `updateMany` filtrado por id + workshopId del contexto +
 * source='owner' + verification='unverified'. Si count === 0 se re-lee y se
 * decide (misma matriz que verify):
 *   - no existe                    → 404
 *   - workshopId ajeno             → 404 (no revelar existencia)
 *   - source='workshop'            → 403 (ya es confiable por origen)
 *   - ya rejected por ESTE taller  → 200 idempotente (devuelve estado actual;
 *                                    el motivo original NO se sobreescribe)
 *   - ya rejected por OTRO taller  → 409 (defensivo)
 *   - ya verified                  → 409
 *
 * El rechazo NUNCA cambia el `source` (D-063) ni borra/oculta el registro
 * (D-202): solo congelá la evidencia (gate FROZEN del adjunto) y lo saca de la
 * cola (filtro `unverified`). El evento se emite SOLO tras el commit exitoso.
 */
@Injectable()
export class RejectCareEpisodeHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async execute(command: RejectCareEpisodeCommand) {
    const { careEpisodeId, reason, workshopId, memberId } = command;
    const rejectedAt = new Date();

    // ── Actualización atómica ──
    const updated = await this.prisma.careEpisode.updateMany({
      where: {
        id: careEpisodeId,
        workshopId,
        source: 'owner',
        verification: 'unverified',
      },
      data: {
        verification: 'rejected',
        rejectedByMemberId: memberId,
        rejectedAt,
        rejectionReason: reason ?? null,
      },
    });

    if (updated.count === 1) {
      // Toma el vehicleId para el payload del evento (la fila existe por la
      // updateMany exitosa; el guard defensivo conserva semántica 404).
      const episode = await this.prisma.careEpisode.findUnique({
        where: { id: careEpisodeId },
        select: {
          id: true,
          vehicleId: true,
          verification: true,
          rejectedByMemberId: true,
          rejectedAt: true,
          rejectionReason: true,
        },
      });
      if (!episode) {
        throw new NotFoundException('CareEpisode', careEpisodeId);
      }

      this.eventEmitter.emit(
        'care-episode.rejected',
        new CareEpisodeRejectedEvent(
          careEpisodeId,
          episode.vehicleId,
          workshopId,
          memberId,
          rejectedAt,
          episode.rejectionReason,
        ),
      );

      return {
        id: careEpisodeId,
        verification: episode.verification,
        rejectedByMemberId: episode.rejectedByMemberId,
        rejectedAt: episode.rejectedAt,
        rejectionReason: episode.rejectionReason,
      };
    }

    // ── count === 0 → re-leer y decidir ──
    const existing = await this.prisma.careEpisode.findUnique({
      where: { id: careEpisodeId },
      select: {
        id: true,
        vehicleId: true,
        workshopId: true,
        source: true,
        verification: true,
        rejectedByMemberId: true,
        rejectedAt: true,
        rejectionReason: true,
      },
    });

    if (!existing) {
      throw new NotFoundException('CareEpisode', careEpisodeId);
    }

    if (existing.workshopId !== workshopId) {
      // Episodio de otro taller → 404 (no revelar existencia)
      throw new NotFoundException('CareEpisode', careEpisodeId);
    }

    if (existing.source !== 'owner') {
      throw new ForbiddenException(
        'Workshop care episodes are already trusted by origin',
      );
    }

    if (existing.verification === 'rejected') {
      const rejecter = existing.rejectedByMemberId
        ? await this.prisma.workshopMember.findUnique({
            where: { id: existing.rejectedByMemberId },
            select: { workshopId: true },
          })
        : null;

      // Ya rechazado por ESTE taller → 200 idempotente (devuelve el estado
      // actual; el motivo original queda intacto — no se rechaza dos veces).
      if (rejecter?.workshopId === workshopId) {
        return {
          id: existing.id,
          verification: existing.verification,
          rejectedByMemberId: existing.rejectedByMemberId,
          rejectedAt: existing.rejectedAt,
          rejectionReason: existing.rejectionReason,
        };
      }

      // Rechazado por OTRO taller (o sin actor registrado) → 409.
      throw new ConflictException(
        'Care episode was already rejected by another workshop',
      );
    }

    if (existing.verification === 'verified') {
      // Verificado (por este u otro taller) no admite rechazo posterior.
      throw new ConflictException('Care episode was already verified');
    }

    // Defensivo: un episodio owner + unverified de este taller habría matcheado
    // la updateMany. Unreachable en práctica.
    throw new NotFoundException('CareEpisode', careEpisodeId);
  }
}
