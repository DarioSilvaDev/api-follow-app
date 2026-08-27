import { Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../../../common/database/prisma.service';
import { UpdateWorkshopStatusCommand } from './update-workshop-status.command';
import { WorkshopStatusChangedEvent } from '../../events/workshop-status-changed.event';

@Injectable()
export class UpdateWorkshopStatusHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async execute(command: UpdateWorkshopStatusCommand) {
    const workshop = await this.prisma.workshop.findUnique({
      where: { id: command.workshopId },
    });

    if (!workshop) throw new NotFoundException('Workshop', command.workshopId);

    await this.prisma.workshop.update({
      where: { id: command.workshopId },
      data: { isActive: command.isActive },
    });

    this.eventEmitter.emit(
      'admin.workshop.status_changed',
      new WorkshopStatusChangedEvent(command.workshopId, command.isActive),
    );
  }
}
