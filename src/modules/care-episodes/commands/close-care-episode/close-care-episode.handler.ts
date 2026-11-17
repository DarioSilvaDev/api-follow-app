import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { CareEpisodeStatus } from '@prisma/client';
import { PrismaService } from '../../../../common/database/prisma.service';
import { NotFoundException } from '../../../../common/exceptions/not-found.exception';
import { MAX_CHECK_IN_SERVICE_TYPES } from '../../dto/check-in.dto';
import { CareEpisodeClosedEvent } from '../../events/care-episode-closed.event';
import { CloseCareEpisodeCommand } from './close-care-episode.command';

export interface CloseCareEpisodeResult {
  data: {
    id: string;
    status: CareEpisodeStatus;
    closedAt: Date;
    mileageOut: number | null;
    mileageOutUnreadable: boolean;
    /**
     * `true` cuando el egreso es menor al máximo histórico del vehículo. NO
     * bloquea el cierre (§5.3): el frontend muestra el modal de confirmación
     * antes de enviar; acá sólo se informa.
     */
    mileageOutlier: boolean;
  };
}

interface LockedEpisodeRow {
  status: string;
  workshop_id: string | null;
  vehicle_id: string;
  mileage_in: number | null;
}

/**
 * CloseCareEpisodeHandler — cierre de atención de taller (B-3).
 *
 * Transición única `open → delivered` (§6.1). Reglas:
 * - Sólo el taller dueño del episodio; `workshopId` sale del contexto.
 * - Sólo desde `open`; `delivered`/`cancelled` → 409 (sin reapertura).
 * - Odómetro de egreso obligatorio: valor **o** excepción "no legible" +
 *   motivo. La excepción exige ≥1 adjunto `phase='after'` vigente.
 * - `mileageOut < mileageIn` del mismo episodio → 400 (error de tipeo).
 * - `mileageOut < máximo histórico` → NO bloquea; se devuelve
 *   `mileageOutlier: true`.
 * - Tipos de atención: aditivos sobre los del check-in; el total final debe
 *   quedar entre 1 y 3. `closeNotes` es OBLIGATORIO: diagnóstico / resumen de
 *   lo que se hizo (D-207) y, cuando aplica, el motivo de excepción
 *   (ej. "tablero reemplazado", D-TL-B4).
 * - El evento `care-episode.closed` se emite SÓLO después del commit.
 */
@Injectable()
export class CloseCareEpisodeHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async execute(
    command: CloseCareEpisodeCommand,
  ): Promise<CloseCareEpisodeResult> {
    const { careEpisodeId, dto, workshopId, memberId } = command;

    // ── 1. Episodio del taller del contexto ──
    const episode = await this.prisma.careEpisode.findFirst({
      where: { id: careEpisodeId, workshopId },
      select: {
        id: true,
        vehicleId: true,
        status: true,
        mileageIn: true,
      },
    });
    if (!episode) {
      throw new NotFoundException('CareEpisode', careEpisodeId);
    }
    if (episode.status !== 'open') {
      throw new ConflictException('La atención ya fue cerrada');
    }

    // ── 2. Odómetro de egreso: valor XOR excepción completa ──
    const unreadable = dto.mileageOutUnreadable === true;
    const hasMileage = dto.mileageOut !== undefined && dto.mileageOut !== null;
    const unreadableReason = dto.mileageOutUnreadableReason?.trim() || null;

    if (unreadable) {
      if (hasMileage) {
        throw new BadRequestException(
          'Indicá el odómetro o marcá "no se puede leer", no ambos',
        );
      }
      if (!unreadableReason) {
        throw new BadRequestException(
          'Indicá el motivo por el que no se puede leer el odómetro',
        );
      }
    } else {
      if (!hasMileage) {
        throw new BadRequestException(
          'El odómetro de egreso es obligatorio (o marcá "no se puede leer")',
        );
      }
      if (unreadableReason) {
        throw new BadRequestException(
          'El motivo de "no legible" sólo aplica cuando marcás esa opción',
        );
      }
      // Cordura del mismo episodio: el egreso no puede ser menor al ingreso.
      if (
        episode.mileageIn !== null &&
        dto.mileageOut! < episode.mileageIn
      ) {
        throw new BadRequestException(
          'El odómetro de egreso no puede ser menor al de ingreso',
        );
      }
    }

    // ── 3. Tipos de atención: aditivos, total final 1..3 ──
    const incoming = await this.resolveServiceTypes(careEpisodeId, dto);

    // El resumen es obligatorio (D-207). El DTO ya valida 10..1000 chars en
    // HTTP; se rechequea acá para que llamadas directas al handler (tests,
    // otros command handlers) no persistan un cierre sin información.
    const closeNotes = dto.closeNotes?.trim();
    if (!closeNotes || closeNotes.length < 10) {
      throw new BadRequestException(
        'Indicá el diagnóstico o resumen de la atención (mínimo 10 caracteres)',
      );
    }

    // ── 4. Transacción: lock + re-chequeo + update ──
    const result = await this.prisma.$transaction(async (tx) => {
      // `::uuid` es obligatorio: Prisma envía el parámetro como text y la
      // columna id es uuid (mismo patrón que el attach handler).
      const lockedRows = await tx.$queryRaw<LockedEpisodeRow[]>`
        SELECT status, workshop_id, vehicle_id, mileage_in
        FROM care_episodes
        WHERE id = ${careEpisodeId}::uuid
        FOR UPDATE`;

      const locked = lockedRows[0];
      if (!locked || locked.workshop_id !== workshopId) {
        throw new NotFoundException('CareEpisode', careEpisodeId);
      }
      if (locked.status !== 'open') {
        throw new ConflictException('La atención ya fue cerrada');
      }

      // La foto del tablero es requisito de servidor en la excepción (§5.4).
      if (unreadable) {
        const afterCount = await tx.careEpisodeAttachment.count({
          where: {
            careEpisodeId,
            phase: 'after',
            removedAt: null,
          },
        });
        if (afterCount === 0) {
          throw new BadRequestException(
            'Adjuntá la foto del tablero antes de cerrar',
          );
        }
      }

      // Máximo histórico del vehículo (episodios + VehicleMileage). No se usa
      // para bloquear: sólo para marcar `mileageOutlier` (§5.3).
      let mileageOutlier = false;
      if (hasMileage) {
        const episodesMax = await tx.careEpisode.aggregate({
          where: { vehicleId: locked.vehicle_id },
          _max: { mileageIn: true, mileageOut: true },
        });
        const mileageMax = await tx.vehicleMileage.aggregate({
          where: { vehicleId: locked.vehicle_id },
          _max: { mileage: true },
        });
        const maxHistorico = Math.max(
          0,
          ...[
            episodesMax._max.mileageIn,
            episodesMax._max.mileageOut,
            mileageMax._max.mileage,
          ].filter((value): value is number => value !== null),
        );
        mileageOutlier = dto.mileageOut! < maxHistorico;
      }

      const closedAt = new Date();
      const updated = await tx.careEpisode.update({
        where: { id: careEpisodeId },
        data: {
          status: 'delivered',
          closedAt,
          closedByMemberId: memberId,
          mileageOut: unreadable ? null : dto.mileageOut,
          mileageOutUnreadable: unreadable,
          mileageOutUnreadableReason: unreadable ? unreadableReason : null,
          closeNotes,
          ...(incoming.length > 0
            ? { serviceTypes: { create: incoming } }
            : {}),
        },
        select: {
          id: true,
          status: true,
          closedAt: true,
          mileageOut: true,
          mileageOutUnreadable: true,
        },
      });

      return {
        data: {
          id: updated.id,
          status: updated.status,
          closedAt: updated.closedAt ?? closedAt,
          mileageOut: updated.mileageOut,
          mileageOutUnreadable: updated.mileageOutUnreadable,
          mileageOutlier,
        },
      };
    });

    // ── 5. Evento post-commit (nunca antes de confirmar) ──
    this.eventEmitter.emit(
      'care-episode.closed',
      new CareEpisodeClosedEvent(
        result.data.id,
        episode.vehicleId,
        workshopId,
        memberId,
      ),
    );

    return result;
  }

  /**
   * Normaliza los tipos del cierre a filas NUEVAS (aditivas).
   *
   * - Deduplica contra los tipos ya cargados en el check-in: reenviar los
   *   chips prellenados no crea filas repetidas.
   * - Valida que los ids del catálogo existan y estén activos.
   * - Total final (existentes + nuevas) debe quedar entre 1 y 3.
   */
  private async resolveServiceTypes(
    careEpisodeId: string,
    dto: CloseCareEpisodeCommand['dto'],
  ): Promise<Array<{ serviceTypeId: string | null; customLabel: string | null }>> {
    const serviceTypeIds = Array.from(new Set(dto.serviceTypeIds ?? []));
    const customLabel = dto.customServiceLabel?.trim() || null;

    const currentLinks = await this.prisma.careEpisodeServiceType.findMany({
      where: { careEpisodeId },
      select: { serviceTypeId: true, customLabel: true },
    });
    const currentIds = new Set(
      currentLinks
        .map((link) => link.serviceTypeId)
        .filter((id): id is string => id !== null),
    );
    const currentLabels = new Set(
      currentLinks
        .map((link) => link.customLabel?.trim().toLowerCase())
        .filter((label): label is string => !!label),
    );

    const newTypeIds = serviceTypeIds.filter((id) => !currentIds.has(id));
    const newCustomLabel =
      customLabel && !currentLabels.has(customLabel.toLowerCase())
        ? customLabel
        : null;

    // Sólo se valida el catálogo de los ids NUEVOS: reenviar un tipo ya
    // cargado (aunque se haya desactivado después) no debe bloquear el cierre.
    if (newTypeIds.length > 0) {
      const existing = await this.prisma.serviceType.findMany({
        where: { id: { in: newTypeIds }, isActive: true },
        select: { id: true },
      });
      if (existing.length !== newTypeIds.length) {
        throw new BadRequestException(
          'Uno o más tipos de atención no existen o están inactivos',
        );
      }
    }

    const finalCount =
      currentLinks.length + newTypeIds.length + (newCustomLabel ? 1 : 0);
    if (finalCount === 0) {
      throw new BadRequestException('Agregá al menos un tipo de atención');
    }
    if (finalCount > MAX_CHECK_IN_SERVICE_TYPES) {
      throw new BadRequestException(
        `Máximo ${MAX_CHECK_IN_SERVICE_TYPES} tipos de atención por atención`,
      );
    }

    return [
      ...newTypeIds.map((serviceTypeId) => ({
        serviceTypeId,
        customLabel: null,
      })),
      ...(newCustomLabel
        ? [{ serviceTypeId: null, customLabel: newCustomLabel }]
        : []),
    ];
  }
}
