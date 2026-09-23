import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../common/database/prisma.service';
import { VehicleAccessService } from '../../../../common/authorization/vehicle-access.service';
import { NotFoundException } from '../../../../common/exceptions/not-found.exception';
import { StorageR2Service } from '../../../../common/storage/storage-r2.service';
import type { CurrentContext } from '../../../../common/context/interfaces/current-context.interface';
import type { AuthenticatedUser } from '../../../../common/types/auth.types';
import { envs } from '../../../../config/envs';
import {
  CareEpisodeAttachmentItem,
  CareEpisodeDetailResponse,
  emptyAttachmentGroups,
} from '../../dto/care-episode-detail-response.dto';

type DetailProjection = 'workshop' | 'owner' | 'other';

/**
 * GetCareEpisodeHandler — GET /api/care-episodes/:id con proyección por actor (S1).
 *
 * Guardas clase: JwtAuthGuard + ContextGuard. Autorización a nivel handler:
 *   1. 404 si el episodio no existe (nunca revelar existencia).
 *   2. PERSONAL/DEALERSHIP/PLATFORM: assertOwnershipOrSharedAccess; Forbidden → 404.
 *   3. WORKSHOP: episode.workshopId === ctx.workshopId + membresía activa → 404 si no.
 *      NO se usa assertWorkshopVehicleAccess (gap conocido: su SQL union no
 *      incluye care_episodes).
 * Proyección:
 *   - taller del episodio → customerComplaint + internalNotes visibles
 *   - dueño vigente       → customerComplaint visible, internalNotes null
 *   - shared/neutral      → ambos null (defense in depth en el mapping)
 * ?signed=true firma SOLO adjuntos activos (removedAt null).
 */
@Injectable()
export class GetCareEpisodeHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly vehicleAccessService: VehicleAccessService,
    private readonly storage: StorageR2Service,
  ) {}

  async execute(
    careEpisodeId: string,
    user: AuthenticatedUser,
    ctx: CurrentContext,
    signed: boolean,
  ): Promise<CareEpisodeDetailResponse> {
    const episode = await this.prisma.careEpisode.findUnique({
      where: { id: careEpisodeId },
      select: {
        id: true,
        vehicleId: true,
        status: true,
        source: true,
        verification: true,
        title: true,
        serviceDate: true,
        workshopId: true,
        workshopName: true,
        mileageIn: true,
        customerComplaint: true,
        customerNotes: true,
        internalNotes: true,
        checkedInAt: true,
        closedAt: true,
        createdAt: true,
        vehicle: {
          select: {
            id: true,
            licensePlate: true,
            manufactureYear: true,
            version: {
              select: {
                name: true,
                model: {
                  select: {
                    name: true,
                    brand: { select: { name: true } },
                  },
                },
              },
            },
          },
        },
        workshop: { select: { name: true } },
      },
    });

    if (!episode) {
      throw new NotFoundException('CareEpisode', careEpisodeId);
    }

    const projection = await this.resolveProjection(
      careEpisodeId,
      episode.vehicleId,
      episode.workshopId,
      user,
      ctx,
    );

    const attachments = await this.prisma.careEpisodeAttachment.findMany({
      where: { careEpisodeId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        key: true,
        originalName: true,
        mimeType: true,
        sizeBytes: true,
        caption: true,
        phase: true,
        uploadedByMemberId: true,
        uploadedByUserId: true,
        createdAt: true,
        removedAt: true,
      },
    });

    const groups = emptyAttachmentGroups();
    let attachmentCount = 0;

    for (const a of attachments) {
      const isRemoved = a.removedAt !== null;
      if (!isRemoved) attachmentCount++;

      const item: CareEpisodeAttachmentItem = {
        id: a.id,
        key: a.key,
        originalName: a.originalName,
        mimeType: a.mimeType,
        sizeBytes: a.sizeBytes,
        caption: a.caption,
        phase: a.phase,
        uploadedByMemberId: a.uploadedByMemberId,
        uploadedByUserId: a.uploadedByUserId,
        removed: isRemoved,
        createdAt: a.createdAt,
      };

      // Nunca firmar adjuntos removidos.
      if (signed && !isRemoved) {
        item.url = await this.storage.getSignedUrl(a.key);
        item.expiresAt = new Date(
          Date.now() + envs.SIGNED_URL_EXPIRES_SECONDS * 1000,
        );
      }

      const group = a.phase ?? 'other';
      groups[group].push(item);
    }

    return {
      id: episode.id,
      vehicleId: episode.vehicleId,
      vehicle: {
        id: episode.vehicle.id,
        licensePlate: episode.vehicle.licensePlate,
        brand: episode.vehicle.version?.model?.brand?.name ?? null,
        model: episode.vehicle.version?.model?.name ?? null,
        manufactureYear: episode.vehicle.manufactureYear,
      },
      status: episode.status,
      source: episode.source,
      verification: episode.verification,
      title: episode.title ?? null,
      serviceDate: episode.serviceDate ?? null,
      workshopId: episode.workshopId ?? null,
      workshopName: episode.workshopName ?? episode.workshop?.name ?? null,
      mileageIn: episode.mileageIn ?? null,
      customerComplaint:
        projection === 'owner' || projection === 'workshop'
          ? episode.customerComplaint
          : null,
      customerNotes: episode.customerNotes ?? null,
      internalNotes: projection === 'workshop' ? episode.internalNotes : null,
      checkedInAt: episode.checkedInAt ?? null,
      closedAt: episode.closedAt ?? null,
      createdAt: episode.createdAt,
      attachments: groups,
      attachmentCount,
    };
  }

  private async resolveProjection(
    careEpisodeId: string,
    vehicleId: string,
    episodeWorkshopId: string | null,
    user: AuthenticatedUser,
    ctx: CurrentContext,
  ): Promise<DetailProjection> {
    // ── WORKSHOP: puerta del taller del episodio + membresía activa ──
    if (ctx.type === 'WORKSHOP') {
      if (episodeWorkshopId !== ctx.workshopId) {
        throw new NotFoundException('CareEpisode', careEpisodeId);
      }
      const member = await this.prisma.workshopMember.findUnique({
        where: { id: ctx.memberId },
        select: { workshopId: true, status: true },
      });
      if (
        !member ||
        member.workshopId !== ctx.workshopId ||
        member.status !== 'active'
      ) {
        throw new NotFoundException('CareEpisode', careEpisodeId);
      }
      return 'workshop';
    }

    // ── PERSONAL / DEALERSHIP / PLATFORM: acceso por vehículo ──
    try {
      await this.vehicleAccessService.assertOwnershipOrSharedAccess({
        vehicleId,
        user,
        context: ctx,
      });
    } catch (err) {
      if (err instanceof ForbiddenException) {
        throw new NotFoundException('CareEpisode', careEpisodeId);
      }
      throw err;
    }

    if (ctx.type === 'PERSONAL') {
      // Solo el dueño VIGENTE ve customerComplaint; shared → neutral.
      const owns = await this.prisma.vehicleOwnership.findFirst({
        where: { vehicleId, userId: user.id, endsAt: null },
        select: { id: true },
      });
      return owns ? 'owner' : 'other';
    }

    // DEALERSHIP titular / PLATFORM super_admin sin rol de dueño → neutral.
    return 'other';
  }
}