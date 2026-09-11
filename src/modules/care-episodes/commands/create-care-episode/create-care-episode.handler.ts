import { ForbiddenException, Injectable } from '@nestjs/common';
import { NotFoundException } from '../../../../common/exceptions/not-found.exception';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../../../common/database/prisma.service';
import { CareEpisodeCreatedEvent } from '../../events/care-episode-created.event';
import { CreateCareEpisodeCommand } from './create-care-episode.command';

/**
 * CreateCareEpisodeHandler — Ejecuta el check-in de un vehículo en un taller.
 *
 * RF-1 / P2-1: La operación requiere contexto WORKSHOP (WorkshopOnlyGuard en
 * el controller garantiza esto antes de llegar aquí).
 *
 * P2-3: El taller puede crear un episodio sobre cualquier vehículo existente
 * (buscado por placa). NO se usa assertVehicleAccess full mode — el taller
 * podría estar atendiendo el vehículo por primera vez sin historial previo.
 */
@Injectable()
export class CreateCareEpisodeHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async execute(command: CreateCareEpisodeCommand) {
    const { vehicleId, branchId, appointmentId } = command.dto;

    // ── Vehicle existence check (P2-3: first contact, no assertVehicleAccess) ──
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: { id: true },
    });
    if (!vehicle) {
      throw new NotFoundException('Vehicle', vehicleId);
    }

    // ── Branch must belong to the context workshop (RF-1) ──
    const branch = await this.prisma.workshopBranch.findFirst({
      where: { id: branchId, workshopId: command.workshopId },
      select: { id: true },
    });
    if (!branch) {
      throw new ForbiddenException(
        'Branch does not belong to the context workshop',
      );
    }

    // ── Appointment validation: optional but if present must match vehicle + workshop ──
    if (appointmentId) {
      const appointment = await this.prisma.appointment.findFirst({
        where: {
          id: appointmentId,
          vehicleId,
          workshopId: command.workshopId,
        },
        select: { id: true },
      });
      if (!appointment) {
        throw new NotFoundException('Appointment', appointmentId);
      }
    }

    // ── Persist ──
    const careEpisode = await this.prisma.careEpisode.create({
      data: {
        vehicleId,
        workshopId: command.workshopId,
        branchId,
        appointmentId: appointmentId ?? null,
        createdByMemberId: command.createdByMemberId,
        status: 'open',
        mileageIn: command.dto.mileageIn,
        customerComplaint: command.dto.customerComplaint,
        customerNotes: command.dto.customerNotes,
        internalNotes: command.dto.internalNotes,
        checkedInAt: new Date(),
      },
    });

    // ── Event: emitted after successful creation ──
    this.eventEmitter.emit(
      'care-episode.created',
      new CareEpisodeCreatedEvent(
        careEpisode.id,
        vehicleId,
        command.workshopId,
        command.createdByMemberId,
      ),
    );

    return careEpisode;
  }
}
