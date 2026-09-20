import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Workshop, WorkshopInvitation, Prisma } from '@prisma/client';
import { v4 as uuid } from 'uuid';
import { CodedHttpException } from '../../../../common/exceptions/coded.exception';
import { ERROR_CODES } from '../../../../common/exceptions/error-codes';
import { PrismaService } from '../../../../common/database/prisma.service';
import { MemberInvitedEvent } from '../../../workshops/events/member-invited.event';
import {
  WORKSHOP_DEFAULT_ROLES,
  WORKSHOP_ROLE_PERMISSIONS,
} from '../../../workshops/workshops.constants';
import { CreateWorkshopCommand } from './create-workshop.command';

/**
 * D-106: alta administrada de taller (onboarding admin).
 *
 * Espejo de CreateDealershipHandler:
 * 1. Dedupe de nombre (case-insensitive) y CUIT (normalizado, solo dígitos).
 * 2. Crea el Workshop en `pending_claim` con roles default owner/mechanic/
 *    employee (constantes compartidas del módulo workshops — espejo del seed).
 * 3. Crea la invitación del dueño (rol owner, expires en 7 días).
 * 4. Emite `workshop.member.invited` (el listener envía el mail del wizard).
 *
 * Transaccional: roles + invitación son un solo commit. El token NUNCA se
 * devuelve en la respuesta (solo viaja por email).
 */
@Injectable()
export class CreateWorkshopHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async execute(command: CreateWorkshopCommand) {
    const dto = command.dto;
    const taxId = dto.taxId ? dto.taxId.replace(/\D/g, '') : null;
    const email = dto.ownerEmail.toLowerCase();

    // Dedupe amigable de nombre (case-insensitive). El CUIT se cubre con el
    // unique (pre-check + P2002 race para mensaje controlado).
    const nameClash = await this.prisma.workshop.findFirst({
      where: { name: { equals: dto.name, mode: 'insensitive' } },
      select: { id: true },
    });
    if (nameClash) {
      throw new CodedHttpException(
        409,
        'Ya existe un taller con este nombre',
        ERROR_CODES.CONFLICT,
      );
    }

    if (taxId) {
      const taxIdClash = await this.prisma.workshop.findUnique({
        where: { taxId },
        select: { id: true },
      });
      if (taxIdClash) {
        throw new CodedHttpException(
          409,
          'Ya existe un taller con este CUIT',
          ERROR_CODES.CONFLICT,
        );
      }
    }

    const token = uuid();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    // Mismo patrón que PrismaWorkshopRepository.create: pre-fetch de los
    // permissions y linkeo por permissionId.
    const permissions = await this.prisma.permission.findMany({
      where: { code: { in: Object.values(WORKSHOP_ROLE_PERMISSIONS).flat() } },
      select: { id: true, code: true },
    });
    const permissionMap = new Map(permissions.map((p) => [p.code, p.id]));

    let workshop: Workshop;
    let invitation: WorkshopInvitation;

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const created = await tx.workshop.create({
          data: {
            name: dto.name,
            taxId,
            email,
            status: 'pending_claim',
            isActive: true,
            roles: {
              create: WORKSHOP_DEFAULT_ROLES.map((role) => ({
                code: role.code,
                name: role.name,
                isSystem: true,
                priority: role.priority,
                permissions: {
                  create: (WORKSHOP_ROLE_PERMISSIONS[role.code] ?? [])
                    .filter((code) => permissionMap.has(code))
                    .map((code) => ({
                      permissionId: permissionMap.get(code)!,
                    })),
                },
              })),
            },
          },
        });

        const ownerRole = await tx.workshopRole.findUnique({
          where: {
            workshopId_code: { workshopId: created.id, code: 'owner' },
          },
        });
        if (!ownerRole) {
          throw new Error(`Owner role missing for workshop ${created.id}`);
        }

        const invitation = await tx.workshopInvitation.create({
          data: {
            workshopId: created.id,
            roleId: ownerRole.id,
            invitedById: command.invitedById,
            email,
            token,
            expiresAt,
            status: 'pending',
          },
        });

        return { workshop: created, invitation };
      });

      workshop = result.workshop;
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
            'Ya existe un taller con este CUIT',
            ERROR_CODES.CONFLICT,
          );
        }
        throw new CodedHttpException(
          409,
          'Ya existe un taller con estos datos',
          ERROR_CODES.CONFLICT,
        );
      }
      throw error;
    }

    this.eventEmitter.emit(
      'workshop.member.invited',
      new MemberInvitedEvent(workshop.id, email, token),
    );

    return {
      ...workshop,
      invitation: {
        id: invitation.id,
        email: invitation.email,
        expiresAt: invitation.expiresAt,
        status: invitation.status,
      },
    };
  }
}