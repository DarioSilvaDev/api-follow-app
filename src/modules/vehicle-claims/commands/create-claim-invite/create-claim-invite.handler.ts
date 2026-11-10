import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma, VehicleClaimStatus } from '@prisma/client';
import { randomBytes } from 'crypto';
import { VehicleAccessService } from '../../../../common/authorization/vehicle-access.service';
import { PrismaService } from '../../../../common/database/prisma.service';
import { CodedHttpException } from '../../../../common/exceptions/coded.exception';
import { ERROR_CODES } from '../../../../common/exceptions/error-codes';
import { envs } from '../../../../config/envs';
import {
  CLAIM_ACTIVE_OWNER_MESSAGE,
  CLAIM_NOT_FOUND_MESSAGE,
  CLAIM_UNAVAILABLE_MESSAGE,
} from '../../claim-messages';
import type { WorkshopClaimCreateData } from '../../dto/workshop-claim-response.dto';
import { VehicleClaimInvitedEvent } from '../../events/vehicle-claim-invited.event';
import { ClaimQrService } from '../../services/claim-qr.service';
import { CLAIM_OPEN_STATUSES } from '../../services/claim-state.service';
import { ClaimTokenService } from '../../services/claim-token.service';
import { CreateClaimInviteCommand } from './create-claim-invite.command';

/** Vida del invite (D-VC-1): 7 días. */
export const CLAIM_INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const MAX_TOKEN_ATTEMPTS = 3;

type OwnerConflictReason = 'already_claimed' | 'active_owner';

interface InviteRow {
  id: string;
  vehicleId: string;
  workshopId: string;
  careEpisodeId: string | null;
  status: VehicleClaimStatus;
  expiresAt: Date;
  ownerPhone: string | null;
  qrObjectKey: string | null;
  createdByUserId: string | null;
  createdAt: Date;
}

const INVITE_SELECT = {
  id: true,
  vehicleId: true,
  workshopId: true,
  careEpisodeId: true,
  status: true,
  expiresAt: true,
  ownerPhone: true,
  qrObjectKey: true,
  createdByUserId: true,
  createdAt: true,
} as const;

interface CreateOrReactivateParams {
  vehicleId: string;
  workshopId: string;
  licensePlate: string;
  careEpisodeId: string | null;
  ownerPhone: string | null;
  userId: string | null;
  now: Date;
}

/** Datos mínimos que trae `care-episode.closed` (D-TL-VC-9). */
export interface CloseInviteParams {
  vehicleId: string;
  workshopId: string;
  careEpisodeId: string;
}

/** Motivo por el que el listener de cierre no genera/reactiva un invite. */
export type CloseInviteSkipReason =
  | 'vehicle_not_found'
  | 'active_invite'
  | 'already_claimed'
  | 'active_owner'
  | 'revoked'
  | 'claim_blocked';

/**
 * Resultado de `executeFromClose`. El listener sólo loguea: nunca hay request
 * que responder, y el cierre del `CareEpisode` ya está commiteado.
 */
export type CloseInviteOutcome =
  | { action: 'created'; inviteId: string }
  | { action: 'reactivated'; inviteId: string }
  | { action: 'skipped'; reason: CloseInviteSkipReason };

/**
 * Resultado interno de crear/reactivar. `applied` distingue "esta ejecución
 * escribió la fila" de "reutilizó la que ya existía" (carrera con otra
 * petición/cierre); el controlador sólo necesita `reused` para el 200/201.
 */
interface InviteMutationResult {
  data: WorkshopClaimCreateData;
  reused: boolean;
  applied: boolean;
}

/**
 * CreateClaimInviteHandler — POST /api/vehicle-claims (T1, D-TL-VC-9).
 *
 * Orden de reglas:
 * 1. Invite vigente → se devuelve el existente (200) SIN link: el token no se
 *    puede recuperar (S-1). El panel re-muestra el QR.
 * 2. Vehículo ya reclamado / con titular activo → 409 con `errors.reason`
 *    (`already_claimed` | `active_owner`).
 * 3. Último invite `revoked`/`claim_blocked` → se crea uno nuevo (esos estados
 *    no cuentan como activos en el índice parcial).
 * 4. Último invite `expired` → se reactiva el MISMO id con token+hash nuevos,
 *    vencimiento +7d, contadores en 0 y QR regenerado (T18/F-12).
 *
 * El token crudo sólo vive en la respuesta de este endpoint; en BD queda
 * únicamente `sha256(token)` (S-1).
 */
@Injectable()
export class CreateClaimInviteHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly vehicleAccess: VehicleAccessService,
    private readonly tokenService: ClaimTokenService,
    private readonly qr: ClaimQrService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async execute(
    command: CreateClaimInviteCommand,
  ): Promise<{ data: WorkshopClaimCreateData; reused: boolean }> {
    const { dto, context, user } = command;

    if (context.type !== 'WORKSHOP') {
      throw new ForbiddenException(
        'This operation requires a WORKSHOP context',
      );
    }

    await this.vehicleAccess.assertVehicleAccess({
      vehicleId: dto.vehicleId,
      user,
      context,
    });

    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: dto.vehicleId },
      select: { id: true, licensePlate: true, deletedAt: true },
    });
    if (!vehicle || vehicle.deletedAt !== null) {
      throw new NotFoundException(CLAIM_NOT_FOUND_MESSAGE);
    }

    if (dto.careEpisodeId) {
      const episode = await this.prisma.careEpisode.findFirst({
        where: {
          id: dto.careEpisodeId,
          vehicleId: vehicle.id,
          workshopId: context.workshopId,
          status: { not: 'cancelled' },
        },
        select: { id: true },
      });
      if (!episode) {
        throw new BadRequestException(
          'La atención no corresponde a este vehículo.',
        );
      }
    }

    const now = new Date();
    const ownerPhone = await this.resolveOwnerPhone(vehicle.id, dto.ownerPhone);

    const active = await this.findActive(vehicle.id);
    if (active) {
      if (active.expiresAt.getTime() > now.getTime()) {
        return {
          data: await this.toCreateData(active, vehicle.licensePlate),
          reused: true,
        };
      }

      // T15 lazy: libera el índice parcial antes de reactivar/crear.
      await this.prisma.vehicleClaimInvite.updateMany({
        where: { id: active.id, status: { in: CLAIM_OPEN_STATUSES } },
        data: { status: 'expired' },
      });
    }

    await this.assertNoActiveOwner(vehicle.id);

    const params: CreateOrReactivateParams = {
      vehicleId: vehicle.id,
      workshopId: context.workshopId,
      licensePlate: vehicle.licensePlate,
      careEpisodeId: dto.careEpisodeId ?? null,
      ownerPhone,
      userId: user.id,
      now,
    };

    const expired = await this.findLastExpired(vehicle.id);
    if (expired) {
      return this.reactivate(expired, params);
    }

    return this.createNew(params);
  }

  /**
   * Camino automático del primer cierre (`care-episode.closed`, D-TL-VC-9).
   *
   * Diferencias deliberadas con `execute` (que es la vía manual):
   * - No hay sesión ni `assertVehicleAccess`: el evento ya nació de un cierre
   *   autorizado del taller, y el payload trae `workshopId`.
   * - `revoked`/`claim_blocked` **no** se reviven solos: la revocación es una
   *   decisión humana y sólo la acción explícita del taller crea un invite nuevo.
   * - Un titular activo o un invite `claimed` no son error (no hay request):
   *   se omiten y el listener deja el `skipReason` en el log (AC-24).
   * - Un invite abierto pero vencido se expira lazy y se reactiva (T18).
   */
  async executeFromClose(
    params: CloseInviteParams,
  ): Promise<CloseInviteOutcome> {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: params.vehicleId },
      select: { id: true, licensePlate: true, deletedAt: true },
    });
    if (!vehicle || vehicle.deletedAt !== null) {
      return { action: 'skipped', reason: 'vehicle_not_found' };
    }

    const now = new Date();
    const ownerPhone = await this.resolveOwnerPhone(vehicle.id);

    // Regla 1: invite vigente → idempotente.
    const active = await this.findActive(vehicle.id);
    if (active) {
      if (active.expiresAt.getTime() > now.getTime()) {
        return { action: 'skipped', reason: 'active_invite' };
      }

      // T15 lazy: un invite abierto pero vencido no cuenta como vigente.
      await this.prisma.vehicleClaimInvite.updateMany({
        where: { id: active.id, status: { in: CLAIM_OPEN_STATUSES } },
        data: { status: 'expired' },
      });
    }

    // Regla 2: ya reclamado o con titular activo (cualquier origen) → nada.
    const claimed = await this.prisma.vehicleClaimInvite.findFirst({
      where: { vehicleId: vehicle.id, status: 'claimed' },
      orderBy: { usedAt: 'desc' },
      select: { id: true },
    });
    if (claimed) {
      return { action: 'skipped', reason: 'already_claimed' };
    }

    const activeOwner = await this.prisma.vehicleOwnership.findFirst({
      where: {
        vehicleId: vehicle.id,
        endsAt: null,
        type: { not: 'co_owner' },
      },
      select: { id: true },
    });
    if (activeOwner) {
      return { action: 'skipped', reason: 'active_owner' };
    }

    const createParams: CreateOrReactivateParams = {
      vehicleId: vehicle.id,
      workshopId: params.workshopId,
      licensePlate: vehicle.licensePlate,
      careEpisodeId: params.careEpisodeId,
      ownerPhone,
      userId: null,
      now,
    };

    // Regla 3/4/5: reactivar el último vencido, no tocar revocados, crear si
    // el vehículo nunca tuvo invite.
    const latest = await this.findLatest(vehicle.id);
    if (latest?.status === 'expired') {
      const result = await this.reactivate(latest, createParams);
      return result.applied
        ? { action: 'reactivated', inviteId: result.data.id }
        : { action: 'skipped', reason: 'active_invite' };
    }
    if (latest?.status === 'revoked' || latest?.status === 'claim_blocked') {
      return { action: 'skipped', reason: latest.status };
    }

    const result = await this.createNew(createParams);
    return result.applied
      ? { action: 'created', inviteId: result.data.id }
      : { action: 'skipped', reason: 'active_invite' };
  }

  private async createNew(
    params: CreateOrReactivateParams,
  ): Promise<InviteMutationResult> {
    for (let attempt = 0; attempt < MAX_TOKEN_ATTEMPTS; attempt += 1) {
      const token = this.newToken();
      const tokenHash = this.tokenService.hashToken(token);
      const link = this.buildLink(token);
      const qrObjectKey = await this.qr.generateAndUpload('pending', link);

      try {
        const created = await this.prisma.vehicleClaimInvite.create({
          data: {
            vehicleId: params.vehicleId,
            workshopId: params.workshopId,
            careEpisodeId: params.careEpisodeId,
            tokenHash,
            qrObjectKey,
            status: 'pending',
            expiresAt: new Date(params.now.getTime() + CLAIM_INVITE_TTL_MS),
            ownerPhone: params.ownerPhone,
            createdByUserId: params.userId,
          },
          select: INVITE_SELECT,
        });

        const data = await this.toCreateData(
          created,
          params.licensePlate,
          token,
        );
        this.eventEmitter.emit(
          'vehicle-claim.invited',
          new VehicleClaimInvitedEvent(
            created.id,
            created.vehicleId,
            created.workshopId,
            created.ownerPhone,
            false,
          ),
        );
        return { data, reused: false, applied: true };
      } catch (error) {
        if (this.isTokenHashConflict(error)) continue;

        if (this.isActiveUniqueConflict(error)) {
          const current = await this.findActive(params.vehicleId);
          if (current) {
            return {
              data: await this.toCreateData(current, params.licensePlate),
              reused: true,
              applied: false,
            };
          }
        }

        throw error;
      }
    }

    throw new ConflictException(
      'No pudimos generar el link de reclamo. Intentá de nuevo.',
    );
  }

  private async reactivate(
    invite: InviteRow,
    params: CreateOrReactivateParams,
  ): Promise<InviteMutationResult> {
    for (let attempt = 0; attempt < MAX_TOKEN_ATTEMPTS; attempt += 1) {
      const token = this.newToken();
      const tokenHash = this.tokenService.hashToken(token);
      const link = this.buildLink(token);
      const qrObjectKey = await this.qr.generateAndUpload(invite.id, link);

      try {
        const updated = await this.prisma.vehicleClaimInvite.updateMany({
          where: { id: invite.id, status: 'expired' },
          data: {
            status: 'pending',
            tokenHash,
            qrObjectKey,
            expiresAt: new Date(params.now.getTime() + CLAIM_INVITE_TTL_MS),
            ownerPhone: params.ownerPhone,
            careEpisodeId: params.careEpisodeId ?? invite.careEpisodeId,
            // En el camino automático no hay usuario: se conserva el creador
            // original del invite en lugar de borrarlo.
            createdByUserId: params.userId ?? invite.createdByUserId,
            openedAt: null,
            verifiedAt: null,
            failedAttempts: 0,
            lastFailedAt: null,
            verificationLockedAt: null,
            lockoutCount: 0,
            usedAt: null,
            blockedAt: null,
            revokedAt: null,
            revokedByUserId: null,
            revokeReason: null,
            claimOutcome: null,
            claimantUserId: null,
          },
        });

        if (updated.count === 0) {
          const current = await this.findActive(invite.vehicleId);
          if (current) {
            return {
              data: await this.toCreateData(current, params.licensePlate),
              reused: true,
              applied: false,
            };
          }
          throw new ConflictException(CLAIM_UNAVAILABLE_MESSAGE);
        }

        const row = await this.findInvite(invite.id);
        const data = await this.toCreateData(row, params.licensePlate, token);
        this.eventEmitter.emit(
          'vehicle-claim.invited',
          new VehicleClaimInvitedEvent(
            row.id,
            row.vehicleId,
            row.workshopId,
            row.ownerPhone,
            true,
          ),
        );
        return { data, reused: true, applied: true };
      } catch (error) {
        if (this.isTokenHashConflict(error)) continue;

        if (this.isActiveUniqueConflict(error)) {
          const current = await this.findActive(invite.vehicleId);
          if (current) {
            return {
              data: await this.toCreateData(current, params.licensePlate),
              reused: true,
              applied: false,
            };
          }
        }

        throw error;
      }
    }

    throw new ConflictException(
      'No pudimos generar el link de reclamo. Intentá de nuevo.',
    );
  }

  private async findActive(vehicleId: string): Promise<InviteRow | null> {
    return this.prisma.vehicleClaimInvite.findFirst({
      where: { vehicleId, status: { in: CLAIM_OPEN_STATUSES } },
      orderBy: { createdAt: 'desc' },
      select: INVITE_SELECT,
    });
  }

  private async findLastExpired(vehicleId: string): Promise<InviteRow | null> {
    return this.prisma.vehicleClaimInvite.findFirst({
      where: { vehicleId, status: 'expired' },
      orderBy: { createdAt: 'desc' },
      select: INVITE_SELECT,
    });
  }

  /** Invite más reciente del vehículo, sin importar el estado (reglas 3/4). */
  private async findLatest(vehicleId: string): Promise<InviteRow | null> {
    return this.prisma.vehicleClaimInvite.findFirst({
      where: { vehicleId },
      orderBy: { createdAt: 'desc' },
      select: INVITE_SELECT,
    });
  }

  private async findInvite(id: string): Promise<InviteRow> {
    const invite = await this.prisma.vehicleClaimInvite.findUnique({
      where: { id },
      select: INVITE_SELECT,
    });
    if (!invite) {
      throw new NotFoundException(CLAIM_NOT_FOUND_MESSAGE);
    }
    return invite;
  }

  private async resolveOwnerPhone(
    vehicleId: string,
    provided?: string,
  ): Promise<string | null> {
    if (provided) return provided;

    const contact = await this.prisma.vehicleOwnerContact.findFirst({
      where: { vehicleId, isActive: true, status: 'available' },
      orderBy: { createdAt: 'desc' },
      select: { phoneE164: true },
    });
    return contact?.phoneE164 ?? null;
  }

  private async assertNoActiveOwner(vehicleId: string): Promise<void> {
    const claimed = await this.prisma.vehicleClaimInvite.findFirst({
      where: { vehicleId, status: 'claimed' },
      orderBy: { usedAt: 'desc' },
      select: { id: true },
    });
    if (claimed) {
      throw this.ownerConflict('already_claimed');
    }

    const activeOwner = await this.prisma.vehicleOwnership.findFirst({
      where: {
        vehicleId,
        endsAt: null,
        type: { not: 'co_owner' },
      },
      select: { id: true },
    });
    if (activeOwner) {
      throw this.ownerConflict('active_owner');
    }
  }

  private ownerConflict(reason: OwnerConflictReason): CodedHttpException {
    return new CodedHttpException(
      HttpStatus.CONFLICT,
      CLAIM_ACTIVE_OWNER_MESSAGE,
      ERROR_CODES.CONFLICT,
      { reason },
    );
  }

  private newToken(): string {
    return randomBytes(32).toString('hex');
  }

  private buildLink(token: string): string {
    return `${envs.FRONTEND_URL.replace(/\/+$/, '')}/reclamo/${token}`;
  }

  private buildWhatsappUrl(
    ownerPhone: string | null,
    link: string,
    licensePlate: string,
  ): string | null {
    if (!ownerPhone) return null;
    const digits = ownerPhone.replace(/\D/g, '');
    if (digits.length === 0) return null;

    const message = `Hola, tu vehículo ${licensePlate} ya tiene historial en Autentia. Podés reclamarlo acá: ${link}`;
    return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
  }

  private async toCreateData(
    invite: InviteRow,
    licensePlate: string,
    token?: string,
  ): Promise<WorkshopClaimCreateData> {
    const data: WorkshopClaimCreateData = {
      id: invite.id,
      vehicleId: invite.vehicleId,
      licensePlate,
      status: invite.status,
      qrImageUrl: await this.qr.signedUrl(invite.qrObjectKey),
      ownerPhone: invite.ownerPhone,
      expiresAt: invite.expiresAt,
      createdAt: invite.createdAt,
    };

    if (token) {
      const link = this.buildLink(token);
      data.link = link;
      data.whatsappUrl = this.buildWhatsappUrl(
        invite.ownerPhone,
        link,
        licensePlate,
      );
    }

    return data;
  }

  private isP2002(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }

  private p2002Targets(error: unknown): string[] {
    if (!this.isP2002(error)) return [];
    const meta = (error as Prisma.PrismaClientKnownRequestError).meta as
      { target?: unknown } | undefined;
    const target = meta?.target;
    if (Array.isArray(target)) return target.map(String);
    if (typeof target === 'string') return [target];
    return [];
  }

  private isTokenHashConflict(error: unknown): boolean {
    return this.p2002Targets(error).some(
      (target) => target.includes('token_hash') || target.includes('tokenHash'),
    );
  }

  private isActiveUniqueConflict(error: unknown): boolean {
    return this.p2002Targets(error).some(
      (target) =>
        target.includes('vehicle_id') ||
        target.includes('vehicleId') ||
        target.includes('active_unique'),
    );
  }
}
