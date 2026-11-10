import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { CareEpisodeClosedEvent } from '../../care-episodes/events/care-episode-closed.event';
import {
  CloseInviteOutcome,
  CreateClaimInviteHandler,
} from '../commands/create-claim-invite/create-claim-invite.handler';

/**
 * CareEpisodeClosedListener — genera/reactiva el invite de reclamo en el
 * primer cierre de una atención (D-TL-VC-9, AC-22).
 *
 * Best-effort: el `CareEpisode` ya quedó `delivered` cuando este listener
 * corre (evento post-commit), así que un fallo acá nunca revierte ni retrasa
 * el cierre (spec `workshop-checkin-flow.md` CV-16/RF-13). Se loguea por
 * `careEpisodeId`/`vehicleId`; nunca por token ni hash.
 */
@Injectable()
export class CareEpisodeClosedListener {
  private readonly logger = new Logger(CareEpisodeClosedListener.name);

  constructor(
    private readonly createClaimInviteHandler: CreateClaimInviteHandler,
  ) {}

  @OnEvent('care-episode.closed', { async: true })
  async handle(event: CareEpisodeClosedEvent): Promise<void> {
    try {
      const outcome = await this.createClaimInviteHandler.executeFromClose({
        vehicleId: event.vehicleId,
        workshopId: event.workshopId,
        careEpisodeId: event.careEpisodeId,
      });

      this.logOutcome(event, outcome);
    } catch (error) {
      this.logger.error(
        `Claim invite on close failed (vehicleId=${event.vehicleId}, careEpisodeId=${event.careEpisodeId})`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  /**
   * `active_invite` es el camino idempotente normal (otro cierre o el panel ya
   * generaron el link): no se loguea para no inundar el log del piloto.
   */
  private logOutcome(
    event: CareEpisodeClosedEvent,
    outcome: CloseInviteOutcome,
  ): void {
    if (outcome.action === 'skipped' && outcome.reason === 'active_invite') {
      return;
    }

    const context = `vehicleId=${event.vehicleId}, careEpisodeId=${event.careEpisodeId}`;

    if (outcome.action === 'skipped') {
      const message = `Claim invite skipped on close (${context}, skipReason=${outcome.reason})`;
      if (
        outcome.reason === 'active_owner' ||
        outcome.reason === 'already_claimed'
      ) {
        this.logger.warn(message);
      } else {
        this.logger.log(message);
      }
      return;
    }

    this.logger.log(
      `Claim invite ${outcome.action} on close (${context}, inviteId=${outcome.inviteId})`,
    );
  }
}
