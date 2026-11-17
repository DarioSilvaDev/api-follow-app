import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../../common/database/prisma.service';
import { formatDateOnly } from '../../../common/dates/date-only';
import { MailService } from '../../../common/mail/mail.service';
import { CareEpisodeRejectedEvent } from '../events/care-episode-rejected.event';

/**
 * CareEpisodeRejectedEmailListener — aviso al PROPIETARIO por email de que el
 * taller responsable rechazó su registro (D-203/D-204, RF-9).
 *
 * Best-effort: el evento se emite DESPUÉS del commit del rechazo, así que un
 * fallo acá nunca revierte ni retrasa el `POST /:id/reject` (mismo patrón que
 * `CareEpisodeClosedListener` y los listeners de email de transferencia: la
 * frontera de error de email nunca lanza — D-109/D-119).
 *
 * Destinatario: el PROPIETARIO ACTUAL leído de la BD (ownership vigente,
 * semántica D-155 de `loadActiveOwner`), nunca un id del evento: en este
 * flujo el actor es el miembro del taller, no el destinatario.
 *
 * El MOTIVO del rechazo viaja en el mail (decisión del usuario 2026-11-13,
 * enmienda al diseño del PM que recomendaba sin notificación). No se loguea
 * el motivo ni ningún dato del propietario (solo ids de correlación).
 */
@Injectable()
export class CareEpisodeRejectedEmailListener {
  private readonly logger = new Logger(CareEpisodeRejectedEmailListener.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
  ) {}

  @OnEvent('care-episode.rejected', { async: true })
  async handle(event: CareEpisodeRejectedEvent): Promise<void> {
    try {
      const episode = await this.prisma.careEpisode.findUnique({
        where: { id: event.careEpisodeId },
        select: {
          id: true,
          title: true,
          serviceDate: true,
          rejectionReason: true,
          vehicle: { select: { licensePlate: true } },
          workshop: { select: { name: true } },
        },
      });
      if (!episode) {
        this.logger.warn(
          `Rejected email skipped: episode missing (careEpisodeId=${event.careEpisodeId}, vehicleId=${event.vehicleId})`,
        );
        return;
      }

      const owner = await this.prisma.vehicleOwnership.findFirst({
        where: {
          vehicleId: event.vehicleId,
          endsAt: null,
          type: { not: 'co_owner' },
        },
        orderBy: { startsAt: 'desc' },
        select: {
          user: { select: { id: true, firstName: true, email: true } },
        },
      });
      if (!owner?.user) {
        this.logger.warn(
          `Rejected email skipped: no active owner user (careEpisodeId=${event.careEpisodeId}, vehicleId=${event.vehicleId}, workshopId=${event.workshopId})`,
        );
        return;
      }

      await this.mailService.sendCareEpisodeRejectedEmail(
        owner.user.email,
        owner.user.firstName,
        {
          vehicleId: event.vehicleId,
          careEpisodeId: episode.id,
          title: episode.title,
          serviceDate: formatDateOnly(episode.serviceDate),
          licensePlate: episode.vehicle.licensePlate,
          workshopName: episode.workshop?.name ?? null,
          rejectionReason: event.rejectionReason ?? episode.rejectionReason,
        },
        {
          vehicleId: event.vehicleId,
          workshopId: event.workshopId,
          userId: owner.user.id,
        },
      );
    } catch (error) {
      this.logger.error(
        `Rejected email failed unexpectedly (careEpisodeId=${event.careEpisodeId}, vehicleId=${event.vehicleId}, workshopId=${event.workshopId})`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}
