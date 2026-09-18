import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PermissionCache } from '../../../../common/cache/permission-cache';
import { DEALERSHIP_REPOSITORY } from '../../tokens';
import type { DealershipRepository } from '../../repositories/dealership.repository';
import { DealershipCreatedEvent } from '../../events/dealership-created.event';
import { CreateDealershipCommand } from './create-dealership.command';

@Injectable()
export class CreateDealershipHandler {
  constructor(
    @Inject(DEALERSHIP_REPOSITORY)
    private readonly repository: DealershipRepository,
    private readonly eventEmitter: EventEmitter2,
    private readonly permissionCache: PermissionCache,
  ) {}

  async execute(command: CreateDealershipCommand) {
    const dealership = await this.repository.create({
      ...command.dto,
      ownerId: command.ownerId,
    });

    this.eventEmitter.emit(
      'dealership.created',
      new DealershipCreatedEvent(dealership.id, command.ownerId),
    );

    // El dueño pasa a tener permisos dealership → invalidar caché de scope.
    this.permissionCache.invalidateUser(command.ownerId);

    return dealership;
  }
}