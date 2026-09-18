import { Inject, Injectable } from '@nestjs/common';
import { NotFoundException } from '../../../../common/exceptions/not-found.exception';
import { DEALERSHIP_REPOSITORY } from '../../tokens';
import type { DealershipRepository } from '../../repositories/dealership.repository';
import { UpdateDealershipCommand } from './update-dealership.command';

@Injectable()
export class UpdateDealershipHandler {
  constructor(
    @Inject(DEALERSHIP_REPOSITORY)
    private readonly repository: DealershipRepository,
  ) {}

  async execute(command: UpdateDealershipCommand) {
    const existing = await this.repository.findById(command.id);
    if (!existing) throw new NotFoundException('Dealership', command.id);
    return this.repository.update(command.id, command.dto);
  }
}