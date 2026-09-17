import { QrSource } from '@prisma/client';

// D-085 / D-095: origen del QR de transferencia.
export const QR_SOURCE_PRESENCIAL = QrSource.presencial;
export const QR_SOURCE_CONCESIONARIA = QrSource.concesionaria;

export const QR_TTL_SECONDS: Record<QrSource, number> = {
  [QR_SOURCE_PRESENCIAL]: 3600, // 1 hora (D-086 §1)
  [QR_SOURCE_CONCESIONARIA]: 172800, // 48 horas (D-086 §2)
};

// D-TL-6 (D-088): intervalo del sweeper in-process de QRs expirados.
// Se usa con setInterval (precedent D-TL-2: sin @nestjs/schedule en MVP).
export const QR_SWEEPER_INTERVAL_MS = 5 * 60 * 1000;
