import { Inject, Injectable } from '@nestjs/common';
import { NotFoundException } from '../../../../common/exceptions/not-found.exception';
import { WORKSHOP_REPOSITORY } from '../../tokens';
import type { WorkshopRepository } from '../../repositories/workshop.repository';
import { UpdateWorkshopCommand } from './update-workshop.command';

@Injectable()
export class UpdateWorkshopHandler {
  constructor(
    @Inject(WORKSHOP_REPOSITORY)
    private readonly repository: WorkshopRepository,
  ) {}

  async execute(command: UpdateWorkshopCommand) {
    const existing = await this.repository.findById(command.id);
    if (!existing) throw new NotFoundException('Workshop', command.id);
    return this.repository.update(command.id, command.dto);
  }
}
