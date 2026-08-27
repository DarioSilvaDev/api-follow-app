import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/strategies/jwt-auth.guard';
import { ListPublicSpecialtiesHandler } from '../queries/list-specialties/list-specialties.handler';
import { SpecialtyResponseDto } from '../dto/specialty-response.dto';

@Controller()
@UseGuards(JwtAuthGuard)
export class PublicWorkshopController {
  constructor(
    private readonly listPublicSpecialtiesHandler: ListPublicSpecialtiesHandler,
  ) {}

  @Get('specialties')
  async listSpecialties() {
    const specialties = await this.listPublicSpecialtiesHandler.execute();
    return specialties.map(SpecialtyResponseDto.from);
  }
}
