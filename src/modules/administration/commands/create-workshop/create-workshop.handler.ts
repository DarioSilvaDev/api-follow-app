import {
  Inject,
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../../../common/database/prisma.service';
import { PermissionCache } from '../../../../common/cache/permission-cache';
import { WORKSHOP_REPOSITORY } from '../../../workshops/tokens';
import type { WorkshopRepository } from '../../../workshops/repositories/workshop.repository';
import { WorkshopCreatedEvent } from '../../../workshops/events/workshop-created.event';
import { CreateWorkshopCommand } from './create-workshop.command';

@Injectable()
export class CreateWorkshopHandler {
  constructor(
    @Inject(WORKSHOP_REPOSITORY)
    private readonly repository: WorkshopRepository,
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    private readonly permissionCache: PermissionCache,
  ) {}

  async execute(command: CreateWorkshopCommand) {
    const { ownerEmail, ...workshopData } = command.dto;

    const owner = await this.prisma.user.findUnique({
      where: { email: ownerEmail },
    });
    if (!owner) {
      throw new NotFoundException('User', `email ${ownerEmail}`);
    }

    if (owner.deletedAt) {
      throw new BadRequestException(`User with email ${ownerEmail} is deleted`);
    }

    const workshop = await this.repository.create({
      ...workshopData,
      ownerId: owner.id,
    });

    this.eventEmitter.emit(
      'workshop.created',
      new WorkshopCreatedEvent(workshop.id, owner.id),
    );

    this.permissionCache.invalidateUser(owner.id);

    return workshop;
  }
}
