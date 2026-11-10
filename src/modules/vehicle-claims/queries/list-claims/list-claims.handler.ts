import { BadRequestException, Injectable } from '@nestjs/common';
import type { VehicleClaimStatus } from '@prisma/client';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../../../../common/constants';
import { PrismaService } from '../../../../common/database/prisma.service';
import type {
  WorkshopClaimListItem,
  WorkshopClaimListResponse,
} from '../../dto/workshop-claim-response.dto';
import {
  CLAIM_STATUSES,
  effectiveClaimStatus,
  isClaimStatus,
} from '../../utils/effective-claim-status';

export interface ListClaimsQuery {
  workshopId: string;
  page?: number;
  limit?: number;
  status?: string;
}

interface LightRow {
  id: string;
  status: VehicleClaimStatus;
  expiresAt: Date;
  createdAt: Date;
}

/**
 * ListClaimsHandler — `GET /api/vehicle-claims` (panel del taller).
 *
 * Workshop-scoped (el `workshopId` sale del contexto WORKSHOP, nunca de la
 * URL). Paginación page-based con `DEFAULT_PAGE_SIZE=20` / `MAX_PAGE_SIZE=100`
 * y filtro opcional por estado **efectivo** (D-TL-VC-7): un invite abierto con
 * `expiresAt` vencido se muestra `expired` sin escribir en la fila (T15).
 *
 * Estrategia en dos fases, igual que `list-care-episodes`:
 *   1. filas ligeras del taller → estado efectivo, `meta.counts` y filtro.
 *   2. detalle (con patente) SOLO de los ids de la página.
 */
@Injectable()
export class ListClaimsHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute({
    workshopId,
    page,
    limit,
    status,
  }: ListClaimsQuery): Promise<WorkshopClaimListResponse> {
    const safePage =
      typeof page === 'number' && Number.isFinite(page)
        ? Math.max(1, Math.trunc(page))
        : 1;
    const safeLimit =
      typeof limit === 'number' && Number.isFinite(limit)
        ? Math.min(Math.max(1, Math.trunc(limit)), MAX_PAGE_SIZE)
        : DEFAULT_PAGE_SIZE;

    const requestedStatus = this.parseStatus(status);

    const rows = await this.prisma.vehicleClaimInvite.findMany({
      where: { workshopId },
      select: { id: true, status: true, expiresAt: true, createdAt: true },
    });

    const now = new Date();
    const effectiveRows = rows.map((row) => ({
      ...row,
      effective: effectiveClaimStatus(row.status, row.expiresAt, now),
    }));

    const counts = Object.fromEntries(
      CLAIM_STATUSES.map((value) => [value, 0]),
    ) as Record<VehicleClaimStatus, number>;
    for (const row of effectiveRows) {
      counts[row.effective] += 1;
    }

    const filtered = requestedStatus
      ? effectiveRows.filter((row) => row.effective === requestedStatus)
      : effectiveRows;

    filtered.sort((a, b) => {
      const byDate = b.createdAt.getTime() - a.createdAt.getTime();
      return byDate !== 0 ? byDate : a.id.localeCompare(b.id);
    });

    const total = filtered.length;
    const pageRows = filtered.slice(
      (safePage - 1) * safeLimit,
      safePage * safeLimit,
    );

    const meta = {
      total,
      page: safePage,
      limit: safeLimit,
      totalPages: Math.ceil(total / safeLimit),
      counts,
    };

    if (pageRows.length === 0) {
      return { data: [], meta };
    }

    const pageIds = pageRows.map((row) => row.id);
    const details = await this.prisma.vehicleClaimInvite.findMany({
      where: { id: { in: pageIds } },
      select: {
        id: true,
        vehicleId: true,
        status: true,
        claimOutcome: true,
        ownerPhone: true,
        openedAt: true,
        verifiedAt: true,
        usedAt: true,
        failedAttempts: true,
        expiresAt: true,
        createdAt: true,
        updatedAt: true,
        vehicle: { select: { licensePlate: true } },
      },
    });

    const rank = new Map(pageRows.map((row, index) => [row.id, index]));
    details.sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));

    return {
      data: details.map((invite): WorkshopClaimListItem => ({
        id: invite.id,
        vehicleId: invite.vehicleId,
        licensePlate: invite.vehicle.licensePlate,
        status: effectiveClaimStatus(invite.status, invite.expiresAt, now),
        claimOutcome: invite.claimOutcome,
        ownerPhone: invite.ownerPhone,
        openedAt: invite.openedAt,
        verifiedAt: invite.verifiedAt,
        usedAt: invite.usedAt,
        failedAttempts: invite.failedAttempts,
        expiresAt: invite.expiresAt,
        createdAt: invite.createdAt,
        updatedAt: invite.updatedAt,
      })),
      meta,
    };
  }

  private parseStatus(status?: string): VehicleClaimStatus | undefined {
    if (status === undefined || status === '') return undefined;
    if (!isClaimStatus(status)) {
      throw new BadRequestException('Estado de reclamo inválido.');
    }
    return status;
  }
}
