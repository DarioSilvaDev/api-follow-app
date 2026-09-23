import { Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../../../common/database/prisma.service';
import type { AuthenticatedUser } from '../../../../common/types/auth.types';
import { DealershipStatusChangedEvent } from '../../events/dealership-status-changed.event';
import { UpdateDealershipStatusCommand } from './update-dealership-status.command';

/**
 * P2: habilitar/deshabilitar la concesionaria (toggle de `isActive`).
 * 404 si no existe; emite `admin.dealership.status_changed` con actor para
 * auditoría después del update (espejo de UpdateWorkshopStatusHandler).
 */
@Injectable()
export class UpdateDealershipStatusHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async execute(
    command: UpdateDealershipStatusCommand,
    currentUser: AuthenticatedUser,
  ) {
    const dealership = await this.prisma.dealership.findUnique({
      where: { id: command.dealershipId },
    });
    if (!dealership || dealership.deletedAt) {
      throw new NotFoundException('Dealership', command.dealershipId);
    }

    await this.prisma.dealership.update({
      where: { id: command.dealershipId },
      data: { isActive: command.isActive },
    });

    const assignments = await this.prisma.systemRoleAssignment.findMany({
      where: { userId: currentUser.id },
      include: { role: { select: { type: true, priority: true } } },
    });
    const updatedByRole = assignments.length
      ? assignments.reduce((best, a) =>
          a.role.priority > best.role.priority ? a : best,
        ).role.type
      : 'user';

    this.eventEmitter.emit(
      'admin.dealership.status_changed',
      new DealershipStatusChangedEvent(
        command.dealershipId,
        command.isActive,
        currentUser.id,
        updatedByRole,
        command.reason,
      ),
    );
  }
}
