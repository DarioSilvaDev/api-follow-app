import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  Dealership,
  DealershipInvitation,
  Prisma,
  Workshop,
} from '@prisma/client';
import { v4 as uuid } from 'uuid';
import { CodedHttpException } from '../../../../common/exceptions/coded.exception';
import { ERROR_CODES } from '../../../../common/exceptions/error-codes';
import { PrismaService } from '../../../../common/database/prisma.service';
import { MemberInvitedEvent } from '../../../dealerships/events/member-invited.event';
import {
  DEFAULT_ROLES,
  ROLE_PERMISSIONS,
} from '../../../dealerships/dealerships.constants';
import {
  WORKSHOP_DEFAULT_ROLES,
  WORKSHOP_ROLE_PERMISSIONS,
} from '../../../workshops/workshops.constants';
import { CreateDealershipCommand } from './create-dealership.command';

/**
 * D-106: alta administrada de concesionaria (onboarding admin).
 *
 * Espejo de CreateWorkshopHandler pero con el flujo de onboarding:
 * 1. Dedupe de nombre (case-insensitive) y CUIT (normalizado, solo dígitos).
 * 2. Crea la Dealership en `pending_claim` con roles default owner/admin/seller
 *    (constantes compartidas del módulo dealerships — RB-10).
 * 3. D-TL-2: si `hasOwnWorkshop`, crea además el taller de servicio propio en
 *    `pending_claim` (prefill `"{name} Service"`, SIN taxId, con roles default
 *    owner/mechanic/employee) y lo vincula por `Workshop.dealershipId`
 *    (D-TL-1). Desvío deliberado: NO se deduplica el nombre del taller al
 *    alta (el prefill es editable; el dedupe se difiere al claim — AC-6).
 * 4. Crea UNA única invitación del dueño (rol owner, expires en 7 días). El
 *    taller vinculado NO tiene `workshop_invitations` (D-TL-3): el token
 *    compartido es la fila `dealership_invitations`.
 * 5. Emite SOLO `dealership.member.invited` (el listener resuelve el taller
 *    por link y elige el mail combinado — D-TL-5). Nunca se emite
 *    `workshop.member.invited` acá.
 *
 * Transaccional: dealership + (opcional) taller + roles + invitación son un
 * solo commit. El token NUNCA se devuelve en la respuesta (solo viaja por
 * email).
 */
@Injectable()
export class CreateDealershipHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * D-TL-2: bloque de creación de roles del taller (mismo patrón RB-10 de
   * `permissionMap` que usa el alta de taller independiente). Extraído a un
   * helper privado para que el handler no crezca con el mismo bloque inline
   * dos veces (dealership + workshop).
   */
  private buildWorkshopRolesCreate(permissionMap: Map<string, string>) {
    return WORKSHOP_DEFAULT_ROLES.map((role) => ({
      code: role.code,
      name: role.name,
      isSystem: true,
      priority: role.priority,
      permissions: {
        create: (WORKSHOP_ROLE_PERMISSIONS[role.code] ?? [])
          .filter((code) => permissionMap.has(code))
          .map((code) => ({ permissionId: permissionMap.get(code)! })),
      },
    }));
  }

  async execute(command: CreateDealershipCommand) {
    const dto = command.dto;
    const taxId = dto.taxId ? dto.taxId.replace(/\D/g, '') : null;
    const email = dto.ownerEmail.toLowerCase();
    const hasOwnWorkshop = dto.hasOwnWorkshop ?? false;

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

    // D-TL-2: para el taller propio se pre-fetchea su propia matriz de
    // permisos (WORKSHOP_ROLE_PERMISSIONS — RB-10, espejo del seed).
    const workshopPermissions = hasOwnWorkshop
      ? await this.prisma.permission.findMany({
          where: {
            code: { in: Object.values(WORKSHOP_ROLE_PERMISSIONS).flat() },
          },
          select: { id: true, code: true },
        })
      : [];
    const workshopPermissionMap = new Map(
      workshopPermissions.map((p) => [p.code, p.id]),
    );

    let dealership: Dealership;
    let invitation: DealershipInvitation;
    let workshop: Workshop | null = null;

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

        // D-TL-2/D-TL-3: el taller propio nace en la misma transacción, en
        // `pending_claim` y sin taxId (el dueño lo completa en el claim). No
        // se crea `workshop_invitations`: el token compartido es la invitación
        // de la dealership y el taller se resuelve por `Workshop.dealershipId`.
        let createdWorkshop: Workshop | null = null;
        if (hasOwnWorkshop) {
          createdWorkshop = await tx.workshop.create({
            data: {
              name: `${dto.name} Service`,
              status: 'pending_claim',
              isActive: true,
              dealershipId: created.id,
              roles: {
                create: this.buildWorkshopRolesCreate(workshopPermissionMap),
              },
            },
          });
        }

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

        return { dealership: created, invitation, workshop: createdWorkshop };
      });

      dealership = result.dealership;
      invitation = result.invitation;
      workshop = result.workshop;
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
        // P2002 de `workshops_dealership_id_key` (vincular 2 talleres a la
        // misma concesionaria) es un bug del flujo: falla ruidosa = señal.
        throw new CodedHttpException(
          409,
          'Ya existe una concesionaria con estos datos',
          ERROR_CODES.CONFLICT,
        );
      }
      throw error;
    }

    // D-TL-3: una sola invitación → un solo evento. El taller vinculado nunca
    // emite `workshop.member.invited`; el listener de dealership resuelve el
    // taller por link y elige el template combinado (D-TL-5).
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
      workshop: workshop ? { id: workshop.id, name: workshop.name } : null,
    };
  }
}
