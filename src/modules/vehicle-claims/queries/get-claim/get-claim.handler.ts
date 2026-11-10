import { Injectable, NotFoundException } from '@nestjs/common';
import { PermissionCache } from '../../../../common/cache/permission-cache';
import { PrismaService } from '../../../../common/database/prisma.service';
import { CLAIM_NOT_FOUND_MESSAGE } from '../../claim-messages';
import type {
  WorkshopClaimDetail,
  WorkshopClaimDetailResponse,
} from '../../dto/workshop-claim-response.dto';
import { ClaimQrService } from '../../services/claim-qr.service';
import { effectiveClaimStatus } from '../../utils/effective-claim-status';

export interface GetClaimQuery {
  id: string;
  workshopId: string;
  userId: string;
}

/**
 * GetClaimHandler — `GET /api/vehicle-claims/:id` (detalle del panel).
 *
 * Scoping: un invite de otro taller responde 404 (no 403) para no revelar su
 * existencia. El `qrImageUrl` es una URL firmada del objeto persistido en R2:
 * nunca se devuelve el token ni el link (S-1 / AC-6).
 *
 * La cuenta del reclamante sólo se expone en `manual_review` y sólo si la
 * sesión tiene `vehicle-claim.review` (o es `super_admin`). El resto de los
 * estados devuelve `claimant: null`.
 */
@Injectable()
export class GetClaimHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly qr: ClaimQrService,
    private readonly permissionCache: PermissionCache,
  ) {}

  async execute({
    id,
    workshopId,
    userId,
  }: GetClaimQuery): Promise<WorkshopClaimDetailResponse> {
    const invite = await this.prisma.vehicleClaimInvite.findFirst({
      where: { id, workshopId },
      select: {
        id: true,
        vehicleId: true,
        careEpisodeId: true,
        status: true,
        claimOutcome: true,
        ownerPhone: true,
        claimantUserId: true,
        openedAt: true,
        verifiedAt: true,
        usedAt: true,
        failedAttempts: true,
        lastFailedAt: true,
        verificationLockedAt: true,
        lockoutCount: true,
        expiresAt: true,
        blockedAt: true,
        revokedAt: true,
        revokeReason: true,
        createdAt: true,
        updatedAt: true,
        qrObjectKey: true,
        vehicle: {
          select: {
            licensePlate: true,
            manufactureYear: true,
            brandName: true,
            modelName: true,
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
        claimant: {
          select: { firstName: true, lastName: true, email: true },
        },
        attempts: {
          orderBy: { createdAt: 'desc' },
          select: { id: true, outcome: true, createdAt: true },
        },
      },
    });

    if (!invite) {
      throw new NotFoundException(CLAIM_NOT_FOUND_MESSAGE);
    }

    const status = effectiveClaimStatus(invite.status, invite.expiresAt);
    const canReview = await this.canReview(userId, workshopId);

    const data: WorkshopClaimDetail = {
      id: invite.id,
      vehicleId: invite.vehicleId,
      careEpisodeId: invite.careEpisodeId,
      status,
      claimOutcome: invite.claimOutcome,
      ownerPhone: invite.ownerPhone,
      claimantUserId: invite.claimantUserId,
      openedAt: invite.openedAt,
      verifiedAt: invite.verifiedAt,
      usedAt: invite.usedAt,
      failedAttempts: invite.failedAttempts,
      lastFailedAt: invite.lastFailedAt,
      verificationLockedAt: invite.verificationLockedAt,
      lockoutCount: invite.lockoutCount,
      expiresAt: invite.expiresAt,
      blockedAt: invite.blockedAt,
      revokedAt: invite.revokedAt,
      revokeReason: invite.revokeReason,
      createdAt: invite.createdAt,
      updatedAt: invite.updatedAt,
      qrImageUrl: await this.qr.signedUrl(invite.qrObjectKey),
      attempts: invite.attempts,
      vehicle: {
        licensePlate: invite.vehicle.licensePlate,
        brand:
          invite.vehicle.version?.model?.brand?.name ??
          invite.vehicle.brandName ??
          null,
        model:
          invite.vehicle.version?.model?.name ??
          invite.vehicle.modelName ??
          null,
        manufactureYear: invite.vehicle.manufactureYear,
      },
      claimant:
        status === 'manual_review' && canReview ? invite.claimant : null,
    };

    return { data };
  }

  /**
   * Misma semántica que `PermissionsGuard`: `super_admin` hace bypass; si no,
   * el permiso se resuelve en el scope del taller activo. Se lee primero el
   * caché que el guard ya pobló en esta request.
   */
  private async canReview(
    userId: string,
    workshopId: string,
  ): Promise<boolean> {
    const cacheKey = `${userId}:${workshopId}`;
    const cached = this.permissionCache.get(cacheKey);
    if (cached) {
      return (
        cached.systemRoles.includes('super_admin') ||
        cached.permissions.has('vehicle-claim.review')
      );
    }

    const assignments = await this.prisma.systemRoleAssignment.findMany({
      where: { userId },
      select: { role: { select: { type: true } } },
    });
    if (
      assignments.some((assignment) => assignment.role.type === 'super_admin')
    ) {
      return true;
    }

    const member = await this.prisma.workshopMember.findUnique({
      where: { workshopId_userId: { workshopId, userId } },
      select: {
        role: {
          select: {
            permissions: {
              select: { permission: { select: { code: true } } },
            },
          },
        },
      },
    });

    return (
      member?.role.permissions.some(
        (rolePermission) =>
          rolePermission.permission.code === 'vehicle-claim.review',
      ) ?? false
    );
  }
}
