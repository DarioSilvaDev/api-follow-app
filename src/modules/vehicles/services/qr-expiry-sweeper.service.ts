import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../../common/database/prisma.service';
import { envs } from '../../../config/envs';
import { QR_SWEEPER_INTERVAL_MS } from '../constants/transfer-qr.constants';
import { VehicleTransferQrExpiredEvent } from '../events/vehicle-transfer-qr-expired.event';

/**
 * D-TL-6 (D-088): sweeper in-process que persiste `status='expired'` para los
 * QRs pendientes con `expiresAt` vencido y emite `vehicle.transfer.qr_expired`
 * SOLO por los realmente actualizados (evita doble email con el lazy-on-read).
 *
 * - `setInterval` manual (precedent D-TL-2: sin @nestjs/schedule en el MVP).
 * - El timer NO se arranca en NODE_ENV=test: los tests invocan `run()` directo.
 * - Batch de 100 por corrida; ante más pendientes, la siguiente corrida (5 min)
 *   continúa.
 */
@Injectable()
export class QrExpirySweeperService implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  onModuleInit(): void {
    if (envs.NODE_ENV === 'test') {
      return;
    }
    this.timer = setInterval(() => {
      void this.run();
    }, QR_SWEEPER_INTERVAL_MS);
    // El sweeper no debe mantener vivo el proceso por sí solo.
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Marca como `expired` los QRs `pending` vencidos y emite el evento
   * `vehicle.transfer.qr_expired` únicamente para los IDs que este sweeper
   * actualizó. Si `count < ids.length`, los restantes ya fueron marcados (y
   * emitidos) por el lazy-on-read (preview/accept/generate) entre el findMany
   * y el updateMany → no re-emitir (evita emails duplicados, D-088).
   */
  async run(): Promise<{ expired: number }> {
    const now = new Date();

    const expired = await this.prisma.vehicleTransferQr.findMany({
      where: { status: 'pending', expiresAt: { lt: now } },
      select: { id: true, vehicleId: true, createdByUserId: true },
      take: 100,
    });

    if (expired.length === 0) {
      return { expired: 0 };
    }

    const ids = expired.map((qr) => qr.id);

    const { count } = await this.prisma.vehicleTransferQr.updateMany({
      where: { id: { in: ids }, status: 'pending' },
      data: { status: 'expired' },
    });

    for (const qr of expired.slice(0, count)) {
      this.eventEmitter.emit(
        'vehicle.transfer.qr_expired',
        new VehicleTransferQrExpiredEvent(
          qr.id,
          qr.vehicleId,
          qr.createdByUserId,
        ),
      );
    }

    return { expired: count };
  }
}
