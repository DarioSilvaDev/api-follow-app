import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../../../common/database/prisma.service';
import { UpdateWorkshopCommand } from './update-workshop.command';
import { WorkshopProfileUpdatedEvent } from '../../../workshops/events/workshop-profile-updated.event';
import {
  normalizeTaxId,
  isValidArgentineTaxId,
} from '../../../workshops/validators/is-valid-tax-id';

const AUDITABLE_FIELDS = [
  'name',
  'legalName',
  'taxId',
  'email',
  'phone',
  'website',
  'description',
] as const;

type AuditableField = (typeof AUDITABLE_FIELDS)[number];

function toStringOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value.trim() === '' ? null : value.trim();
  return String(value);
}

function normalizeEmail(value: unknown): string | null {
  const s = toStringOrNull(value);
  if (!s) return null;
  return s.toLowerCase();
}

function normalizeTaxIdValue(value: unknown): string | null {
  const s = toStringOrNull(value);
  if (!s) return null;
  return normalizeTaxId(s);
}

function valuesEqual(field: AuditableField, current: any, next: any): boolean {
  if (field === 'taxId') {
    return normalizeTaxIdValue(current) === normalizeTaxIdValue(next);
  }
  if (field === 'email') {
    return normalizeEmail(current) === normalizeEmail(next);
  }
  return toStringOrNull(current) === toStringOrNull(next);
}

function mapToDb(field: AuditableField, value: unknown): any {
  if (field === 'taxId') {
    return normalizeTaxIdValue(value);
  }
  if (field === 'email') {
    return normalizeEmail(value);
  }
  return toStringOrNull(value);
}

function toPrismaField(field: AuditableField): string {
  switch (field) {
    case 'legalName':
      return 'legalName';
    case 'taxId':
      return 'taxId';
    case 'email':
      return 'email';
    case 'phone':
      return 'phone';
    case 'website':
      return 'website';
    case 'description':
      return 'description';
    case 'name':
      return 'name';
    default:
      return field;
  }
}

@Injectable()
export class UpdateWorkshopHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async execute(command: UpdateWorkshopCommand) {
    const existing = await this.prisma.workshop.findUnique({
      where: { id: command.workshopId },
    });

    if (!existing || existing.deletedAt) {
      throw new NotFoundException('Workshop', command.workshopId);
    }

    const dto = command.dto as any;
    const changes: Record<string, { from: string | null; to: string | null }> = {};

    for (const field of AUDITABLE_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(dto, field)) {
        const nextValue = dto[field];
        if (!valuesEqual(field, (existing as any)[field], nextValue)) {
          changes[field] = {
            from: toStringOrNull((existing as any)[field]),
            to: toStringOrNull(nextValue),
          };
        }
      }
    }

    if (Object.keys(changes).length === 0) {
      return existing;
    }

    if ('taxId' in changes) {
      const to = changes.taxId.to;
      if (!isValidArgentineTaxId(to)) {
        throw new ConflictException('taxId', 'invalid');
      }
    }

    const data: Prisma.WorkshopUpdateInput = {};
    for (const [field, change] of Object.entries(changes)) {
      const key = toPrismaField(field as AuditableField);
      data[key] = mapToDb(field as AuditableField, change.to);
    }

    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        const workshop = await tx.workshop.update({
          where: { id: command.workshopId },
          data,
        });

        await tx.workshopProfileChange.createMany({
          data: [
            {
              workshopId: command.workshopId,
              changedByUserId: command.actorUserId ?? null,
              reason: dto.reason ?? null,
              fields: changes as any,
            },
          ],
        });

        return workshop;
      });

      this.eventEmitter.emit(
        'workshop.profile.updated',
        new WorkshopProfileUpdatedEvent(
          command.workshopId,
          changes,
          command.actorUserId ?? null,
          dto.reason,
        ),
      );

      return updated;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002' && error.meta?.target) {
          const target = Array.isArray(error.meta.target)
            ? error.meta.target
            : [String(error.meta.target)];
          if (target.includes('tax_id')) {
            throw new ConflictException('taxId', 'taken');
          }
          if (target.includes('email') || target.includes('id')) {
            throw new ConflictException('workshop', 'constraint');
          }
        }
      }
      throw error;
    }
  }
}
