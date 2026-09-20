import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Dealership, DealershipInvitation, Prisma } from '@prisma/client';
import { v4 as uuid } from 'uuid';
import { CodedHttpException } from '../../../../common/exceptions/coded.exception';
import { ERROR_CODES } from '../../../../common/exceptions/error-codes';
import { PrismaService } from '../../../../common/database/prisma.service';
import { MemberInvitedEvent } from '../../../dealerships/events/member-invited.event';
import {
  DEFAULT_ROLES,
  ROLE_PERMISSIONS,
} from '../../../dealerships/dealerships.constants';
import { CreateDealershipCommand } from './create-dealership.command';

/**
 * D-106: alta administrada de concesionaria (onboarding admin).
 *
 * Espejo de CreateWorkshopHandler pero con el flujo de onboarding:
 * 1. Dedupe de nombre (case-insensitive) y CUIT (normalizado, solo dígitos).
 * 2. Crea la Dealership en `pending_claim` con roles default owner/admin/seller
 *    (constantes compartidas del módulo dealerships — RB-10).
 * 3. Crea la invitación del dueño (rol owner, expires en 7 días).
 * 4. Emite `dealership.member.invited` (el listener envía el mail del wizard).
 *
 * Transaccional: roles + invitación son un solo commit. El token NUNCA se
 * devuelve en la respuesta (solo viaja por email).
 */
@Injectable()
export class CreateDealershipHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async execute(command: CreateDealershipCommand) {
    const dto = command.dto;
    const taxId = dto.taxId ? dto.taxId.replace(/\D/g, '') : null;
    const email = dto.ownerEmail.toLowerCase();

    // Dedupe amigable de nombre (case-insensitive). El CUIT se cubre con el
    // unique (pre-check + P2002 race para mensaje controlado).
    const nameClash = await this.prisma.dealership.findFirst({
      where: { name: { equals: dto.name, mode: 'insensitive' } },
      select: { id: true },
    });
    if (nameClash) {
      throw new CodedHttpException(
        409,
        'Ya existe una concesionaria con este nombre',
        ERROR_CODES.CONFLICT,
      );
    }

    if (taxId) {
      const taxIdClash = await this.prisma.dealership.findUnique({
        where: { taxId },
        select: { id: true },
      });
      if (taxIdClash) {
        throw new CodedHttpException(
          409,
          'Ya existe una concesionaria con este CUIT',
          ERROR_CODES.CONFLICT,
        );
      }
    }

    const token = uuid();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    // Mismo patrón que PrismaDealershipRepository.create: pre-fetch de los
    // permissions y linkeo por permissionId (RB-10).
    const permissions = await this.prisma.permission.findMany({
      where: { code: { in: Object.values(ROLE_PERMISSIONS).flat() } },
      select: { id: true, code: true },
    });
    const permissionMap = new Map(permissions.map((p) => [p.code, p.id]));

    let dealership: Dealership;
    let invitation: DealershipInvitation;

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const created = await tx.dealership.create({
          data: {
            name: dto.name,
            taxId,
            email,
            status: 'pending_claim',
            isActive: true,
            roles: {
              create: DEFAULT_ROLES.map((role) => ({
                code: role.code,
                name: role.name,
                isSystem: true,
                priority: role.priority,
                permissions: {
                  create: (ROLE_PERMISSIONS[role.code] ?? [])
                    .filter((code) => permissionMap.has(code))
                    .map((code) => ({
                      permissionId: permissionMap.get(code)!,
                    })),
                },
              })),
            },
          },
        });

        const ownerRole = await tx.dealershipRole.findUnique({
          where: {
            dealershipId_code: { dealershipId: created.id, code: 'owner' },
          },
        });
        if (!ownerRole) {
          throw new Error(`Owner role missing for dealership ${created.id}`);
        }

        const invitation = await tx.dealershipInvitation.create({
          data: {
            dealershipId: created.id,
            roleId: ownerRole.id,
            invitedById: command.invitedById,
            email,
            token,
            expiresAt,
            status: 'pending',
          },
        });

        return { dealership: created, invitation };
      });

      dealership = result.dealership;
      invitation = result.invitation;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const target = (error.meta as { target?: string[] })?.target;
        if (target?.includes('tax_id')) {
          throw new CodedHttpException(
            409,
            'Ya existe una concesionaria con este CUIT',
            ERROR_CODES.CONFLICT,
          );
        }
        throw new CodedHttpException(
          409,
          'Ya existe una concesionaria con estos datos',
          ERROR_CODES.CONFLICT,
        );
      }
      throw error;
    }

    this.eventEmitter.emit(
      'dealership.member.invited',
      new MemberInvitedEvent(dealership.id, email, token, dealership.name),
    );

    return {
      ...dealership,
      invitation: {
        id: invitation.id,
        email: invitation.email,
        expiresAt: invitation.expiresAt,
        status: invitation.status,
      },
    };
  }
}
