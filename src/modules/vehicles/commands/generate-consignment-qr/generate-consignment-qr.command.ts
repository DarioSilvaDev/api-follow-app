import { QrPurpose } from '@prisma/client';
import { CurrentContext } from '../../../../common/context/interfaces/current-context.interface';

/**
 * Generación de QRs de la cadena de consignación (Fase 2b):
 * - purpose `take`   → vendedor persona (contexto PERSONAL), schedule opcional.
 * - purpose `sale`   → concesionaria titular (contexto DEALERSHIP, permiso vehicle.sell).
 * - purpose `return` → concesionaria titular (contexto DEALERSHIP, permiso vehicle.return).
 *
 * El contexto resolvido por ContextGuard se pasa para que el handler pueda
 * distinguir rama persona vs. rama dealership en rutas de contexto mixto.
 */
export class GenerateConsignmentQrCommand {
  constructor(
    public readonly vehicleId: string,
    public readonly userId: string,
    public readonly purpose: QrPurpose,
    public readonly ctx?: CurrentContext,
    public readonly schedule?: 'immediate' | 'pickup',
  ) {}
}
