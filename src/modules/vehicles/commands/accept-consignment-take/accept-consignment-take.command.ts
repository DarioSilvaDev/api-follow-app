import { VehicleTransferQr } from '@prisma/client';
import { DealershipContext } from '../../../../common/context/interfaces/current-context.interface';

/**
 * Aceptación del QR de TOMA (D-TL-14) — ejecutada por un miembro activo de la
 * concesionaria en representación de la dealership (QrPurpose = 'take').
 *
 * El QR llega pre-validado (status pending + chequeos de expiración ya
 * realizados por el accept clásico que enruta por purpose, A1).
 */
export class AcceptConsignmentTakeQrCommand {
  constructor(
    public readonly qr: VehicleTransferQr,
    public readonly userId: string,
    public readonly ctx: DealershipContext,
  ) {}
}
