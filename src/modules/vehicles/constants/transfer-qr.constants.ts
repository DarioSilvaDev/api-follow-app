export const QR_SOURCE_PRESENCIAL = 'presencial';
export const QR_SOURCE_CONCESIONARIA = 'concesionaria';

export const QR_TTL_SECONDS: Record<string, number> = {
  [QR_SOURCE_PRESENCIAL]: 3600,         // 1 hora (D-086 §1)
  [QR_SOURCE_CONCESIONARIA]: 172800,    // 48 horas (D-086 §2)
};
