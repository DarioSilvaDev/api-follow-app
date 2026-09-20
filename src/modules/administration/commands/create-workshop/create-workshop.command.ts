import { BaseCommand } from '../../../../common/commands/base.command';
import { CreateWorkshopOnboardingDto } from '../../dto/create-workshop-onboarding.dto';

/**
 * D-106: alta administrada de taller (onboarding admin).
 * `invitedById` es el admin de plataforma que ejecuta POST /admin/workshops.
 */
export class CreateWorkshopCommand extends BaseCommand {
  constructor(
    public readonly dto: CreateWorkshopOnboardingDto,
    public readonly invitedById: string,
  ) {
    super();
  }
}