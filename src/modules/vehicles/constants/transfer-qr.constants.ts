import { QrPurpose, QrSource } from '@prisma/client';

// D-085 / D-095: origen del QR de transferencia.
export const QR_SOURCE_PRESENCIAL = QrSource.presencial;
export const QR_SOURCE_CONCESIONARIA = QrSource.concesionaria;

export const QR_TTL_SECONDS: Record<QrSource, number> = {
  [QR_SOURCE_PRESENCIAL]: 3600, // 1 hora (D-086 §1)
  [QR_SOURCE_CONCESIONARIA]: 172800, // 48 horas (D-086 §2)
};

// RB-11 / D-TL-15: TTLs por propósito dentro de la cadena de consignación.
export const QR_TAKE_IMMEDIATE_TTL_SECONDS = 60 * 60; // 60 min — toma presencial
export const QR_TAKE_PICKUP_TTL_SECONDS = 48 * 60 * 60; // 2880 min (48h) — retiro diferido (D-104)
export const QR_SALE_TTL_SECONDS = 60 * 60; // 60 min — venta (D-082)
export const QR_RETURN_TTL_SECONDS = 60 * 60; // 60 min — devolución (resolución PM §28 §3.7)

/**
 * Resuelve el TTL de un QR de consignación según su propósito.
 * La toma admite schedule `immediate | pickup` (el resto son fijos).
 */
export function consignmentQrTtlSeconds(
  purpose: QrPurpose,
  schedule?: 'immediate' | 'pickup',
): number {
  switch (purpose) {
    case 'take':
      return schedule === 'pickup'
        ? QR_TAKE_PICKUP_TTL_SECONDS
        : QR_TAKE_IMMEDIATE_TTL_SECONDS;
    case 'sale':
      return QR_SALE_TTL_SECONDS;
    case 'return':
      return QR_RETURN_TTL_SECONDS;
  }
}

// D-TL-6 (D-088): intervalo del sweeper in-process de QRs expirados.
// Se usa con setInterval (precedent D-TL-2: sin @nestjs/schedule en MVP).
export const QR_SWEEPER_INTERVAL_MS = 5 * 60 * 1000;
