import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../../common/database/prisma.service';
import { EstimateStatus } from '@prisma/client';
import { UpdateEstimateStatusCommand } from './update-estimate-status.command';

const VALID_TRANSITIONS: Record<EstimateStatus, EstimateStatus[]> = {
  [EstimateStatus.draft]: [EstimateStatus.sent],
  [EstimateStatus.sent]: [
    EstimateStatus.accepted,
    EstimateStatus.rejected,
    EstimateStatus.expired,
  ],
  [EstimateStatus.accepted]: [EstimateStatus.converted],
  [EstimateStatus.rejected]: [],
  [EstimateStatus.expired]: [],
  [EstimateStatus.converted]: [],
};

@Injectable()
export class UpdateEstimateStatusHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: UpdateEstimateStatusCommand) {
    const estimate = await this.prisma.estimate.findUnique({
      where: { id: command.id },
    });
    if (!estimate) {
      throw new NotFoundException('Estimate not found');
    }

    const allowed = VALID_TRANSITIONS[estimate.status as EstimateStatus];
    if (!allowed || !allowed.includes(command.status)) {
      throw new BadRequestException(
        `Cannot transition from '${estimate.status}' to '${command.status}'`,
      );
    }

    const updateData: Record<string, unknown> = { status: command.status };
    if (command.status === EstimateStatus.accepted) {
      updateData.acceptedAt = new Date();
    }
    if (command.status === EstimateStatus.rejected) {
      updateData.rejectedAt = new Date();
    }

    return this.prisma.estimate.update({
      where: { id: command.id },
      data: updateData,
    });
  }
}
