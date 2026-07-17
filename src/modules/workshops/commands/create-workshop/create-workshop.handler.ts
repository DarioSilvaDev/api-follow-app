import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PermissionCache } from '../../../../common/cache/permission-cache';
import { WORKSHOP_REPOSITORY } from '../../tokens';
import type { WorkshopRepository } from '../../repositories/workshop.repository';
import { WorkshopCreatedEvent } from '../../events/workshop-created.event';
import { CreateWorkshopCommand } from './create-workshop.command';

@Injectable()
export class CreateWorkshopHandler {
  constructor(
    @Inject(WORKSHOP_REPOSITORY)
    private readonly repository: WorkshopRepository,
    private readonly eventEmitter: EventEmitter2,
    private readonly permissionCache: PermissionCache,
  ) {}

  async execute(command: CreateWorkshopCommand) {
    const workshop = await this.repository.create({
      ...command.dto,
      ownerId: command.ownerId,
    });

    this.eventEmitter.emit(
      'workshop.created',
      new WorkshopCreatedEvent(workshop.id, command.ownerId),
    );

    this.permissionCache.invalidateUser(command.ownerId);

    return workshop;
  }
}
