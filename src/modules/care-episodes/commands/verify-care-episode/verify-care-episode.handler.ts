import {
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../../../common/database/prisma.service';
import { NotFoundException } from '../../../../common/exceptions/not-found.exception';
import { CareEpisodeVerifiedEvent } from '../../events/care-episode-verified.event';
import { VerifyCareEpisodeCommand } from './verify-care-episode.command';

/**
 * VerifyCareEpisodeHandler — Confirmación (verificación) de un episodio
 * registrado por el propietario (RF-5 / D-064).
 *
 * Atomicidad (ajuste #6): updateMany filtrado por id + workshopId del contexto +
 * source='owner' + verification='unverified'. Si count === 0 se re-lee y se
 * decide:
 *   - no existe          → 404
 *   - workshopId ajeno   → 404 (no revelar existencia)
 *   - source='workshop'  → 403 (ya es confiable por origen)
 *   - ya verified por ESTE taller → 200 idempotente (estado actual)
 *   - ya verified por OTRO taller → 409
 *
 * La verificación NUNCA cambia el `source` (D-063).
 */
@Injectable()
export class VerifyCareEpisodeHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async execute(command: VerifyCareEpisodeCommand) {
    const { careEpisodeId, workshopId, memberId } = command;
    const verifiedAt = new Date();

    // ── Actualización atómica ──
    const updated = await this.prisma.careEpisode.updateMany({
      where: {
        id: careEpisodeId,
        workshopId,
        source: 'owner',
        verification: 'unverified',
      },
      data: {
        verification: 'verified',
        verifiedByMemberId: memberId,
        verifiedAt,
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
          verifiedByMemberId: true,
          verifiedAt: true,
        },
      });
      if (!episode) {
        throw new NotFoundException('CareEpisode', careEpisodeId);
      }

      this.eventEmitter.emit(
        'care-episode.verified',
        new CareEpisodeVerifiedEvent(
          careEpisodeId,
          episode.vehicleId,
          workshopId,
          memberId,
          verifiedAt,
        ),
      );

      return {
        id: careEpisodeId,
        verification: episode.verification,
        verifiedByMemberId: episode.verifiedByMemberId,
        verifiedAt: episode.verifiedAt,
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
        verifiedByMemberId: true,
        verifiedAt: true,
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

    if (existing.verification === 'verified' && existing.verifiedByMemberId) {
      const verifier = await this.prisma.workshopMember.findUnique({
        where: { id: existing.verifiedByMemberId },
        select: { workshopId: true },
      });

      // Ya verificado por ESTE taller → 200 idempotente (devuelve estado).
      if (verifier?.workshopId === workshopId) {
        return {
          id: existing.id,
          verification: existing.verification,
          verifiedByMemberId: existing.verifiedByMemberId,
          verifiedAt: existing.verifiedAt,
        };
      }

      // Ya verificado por OTRO taller → 409.
      throw new ConflictException(
        'Care episode was already verified by another workshop',
      );
    }

    // Defensivo: un episodio owner + unverified de este taller habría matcheado
    // la updateMany. Unreachable en práctica.
    throw new NotFoundException('CareEpisode', careEpisodeId);
  }
}
