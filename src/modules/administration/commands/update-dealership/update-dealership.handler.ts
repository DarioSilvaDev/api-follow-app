import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../common/database/prisma.service';
import { CodedHttpException } from '../../../../common/exceptions/coded.exception';
import { ERROR_CODES } from '../../../../common/exceptions/error-codes';
import type { AuthenticatedUser } from '../../../../common/types/auth.types';
import {
  DealershipUpdatedEvent,
  type DealershipFieldChange,
} from '../../events/dealership-updated.event';
import { UpdateDealershipCommand } from './update-dealership.command';

/**
 * P1 (handoff PM): edición admin de identidad y contacto de la concesionaria.
 *
 * Reglas:
 * - 404 si no existe o está soft-deleteada.
 * - `name`: trim, no vacío (400), dedupe case-insensitive (409, keyword "nombre").
 * - `taxId`: normaliza a solo dígitos; si cambia y la concesionaria está
 *   reclamada + activa → 409 `DEALERSHIP_CUIT_LOCKED` salvo super_admin
 *   (D-A, PM confirmado); dedupe por CUIT (409, keyword "cuit"). Value
 *   idéntico = no-op.
 * - Contacto (`legalName`, `phone`, `website`, `description`, `email`):
 *   email en minúsculas; solo se escribe lo que difiere del valor actual.
 * - Sin cambios → retorna existente sin update ni evento.
 * - `data` se construye campo por campo (nunca el DTO crudo) y emite
 *   `admin.dealership.updated` con `changes` después del éxito.
 */
@Injectable()
export class UpdateDealershipHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async execute(command: UpdateDealershipCommand, currentUser: AuthenticatedUser) {
    const existing = await this.prisma.dealership.findUnique({
      where: { id: command.dealershipId },
    });
    if (!existing || existing.deletedAt) {
      throw new NotFoundException('Dealership', command.dealershipId);
    }

    const assignments = await this.prisma.systemRoleAssignment.findMany({
      where: { userId: currentUser.id },
      include: { role: { select: { type: true, priority: true } } },
    });
    const isSuperAdmin = assignments.some((a) => a.role.type === 'super_admin');
    const updatedByRole = assignments.length
      ? assignments.reduce((best, a) =>
          a.role.priority > best.role.priority ? a : best,
        ).role.type
      : 'user';

    const data: Prisma.DealershipUpdateInput = {};
    const changes: Record<string, DealershipFieldChange> = {};

    if (command.dto.name !== undefined) {
      const name =
        typeof command.dto.name === 'string' ? command.dto.name.trim() : null;
      if (!name) {
        throw new BadRequestException('El nombre no puede estar vacío');
      }
      if (name !== existing.name) {
        const clash = await this.prisma.dealership.findFirst({
          where: {
            name: { equals: name, mode: 'insensitive' },
            id: { not: existing.id },
          },
          select: { id: true },
        });
        if (clash) {
          throw new CodedHttpException(
            409,
            'Ya existe una concesionaria con este nombre',
            ERROR_CODES.CONFLICT,
          );
        }
        data.name = name;
        changes.name = { from: existing.name, to: name };
      }
    }

    if (command.dto.taxId !== undefined) {
      const taxId =
        command.dto.taxId === null
          ? null
          : command.dto.taxId.replace(/\D/g, '');
      if (taxId !== existing.taxId) {
        // D-A: `claimedAt !== null` es la condición funcional — el claim fija
        // status='active' + claimedAt en la misma transacción (wizard-claim), y
        // no existe otro camino que mute status/claimedAt. Mantenemos las dos
        // condiciones por defensa en profundidad (Fase 1 validada por TL).
        const taxIdLocked =
          existing.status === 'active' && existing.claimedAt !== null;
        if (taxIdLocked && !isSuperAdmin) {
          throw new CodedHttpException(
            409,
            'El CUIT no puede modificarse porque la concesionaria ya fue reclamada y está activa',
            ERROR_CODES.DEALERSHIP_CUIT_LOCKED,
          );
        }
        if (taxId) {
          const clash = await this.prisma.dealership.findUnique({
            where: { taxId },
            select: { id: true },
          });
          if (clash && clash.id !== existing.id) {
            throw new CodedHttpException(
              409,
              'Ya existe una concesionaria con este CUIT',
              ERROR_CODES.CONFLICT,
            );
          }
        }
        data.taxId = taxId;
        changes.taxId = { from: existing.taxId, to: taxId };
      }
    }

    for (const field of ['legalName', 'phone', 'website', 'description'] as const) {
      const value = command.dto[field];
      if (value !== undefined && value !== existing[field]) {
        data[field] = value;
        changes[field] = { from: existing[field], to: value };
      }
    }

    if (command.dto.email !== undefined) {
      const email =
        command.dto.email === null
          ? null
          : command.dto.email.toLowerCase();
      if (email !== existing.email) {
        data.email = email;
        changes.email = { from: existing.email, to: email };
      }
    }

    if (Object.keys(data).length === 0) {
      return existing;
    }

    let updated;
    try {
      updated = await this.prisma.dealership.update({
        where: { id: existing.id },
        data,
      });
    } catch (error) {
      // Carrera concurrente entre la verificación de duplicados y el write
      // (mismo patrón que create: P2002 → 409 controlado, nunca 500).
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const target = String(
          (error.meta as { target?: string[] } | undefined)?.target ?? '',
        );
        if (target.includes('taxId')) {
          throw new CodedHttpException(
            409,
            'Ya existe una concesionaria con este CUIT',
            ERROR_CODES.CONFLICT,
          );
        }
        throw new CodedHttpException(
          409,
          'Ya existe una concesionaria con este nombre',
          ERROR_CODES.CONFLICT,
        );
      }
      throw error;
    }

    this.eventEmitter.emit(
      'admin.dealership.updated',
      new DealershipUpdatedEvent(
        existing.id,
        currentUser.id,
        updatedByRole,
        changes,
      ),
    );

    return updated;
  }
}
