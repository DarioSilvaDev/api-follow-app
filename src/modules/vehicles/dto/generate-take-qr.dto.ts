import { IsIn, IsNotEmpty } from 'class-validator';

/**
 * RB-11 / D-104: schedule del QR de TOMA.
 * - `immediate`: toma presencial (TTL 60 min)
 * - `pickup`: retiro diferido (TTL 2880 min / 48 h)
 */
export class GenerateTakeQrDto {
  @IsNotEmpty()
  @IsIn(['immediate', 'pickup'])
  schedule!: 'immediate' | 'pickup';
}
