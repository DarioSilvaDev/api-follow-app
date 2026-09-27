/**
 * D-121 (PM): damping de abuso para endpoints que disparan emails.
 *
 * La REGLA INNEGOCIABLE: el límite por destinatario debe ser INVISIBLE para el
 * cliente. Cuando se alcanza, el endpoint responde EXACTAMENTE lo mismo que
 * cuando no se alcanza (mismo status, mismo cuerpo) y simplemente no envía.
 *
 * El motivo es de seguridad, no de estilo: un 429 o un mensaje diferente
 * del tipo "el email existe pero lo limitamos" es un oráculo que convierte un
 * endpoint seguro en un enumerador de cuentas. El límite protege al sistema;
 * la señalización le diría al atacante que encontró una cuenta.
 *
 * In-memory a propósito: es damping de abuso, NO una frontera de seguridad.
 * Un restart lo reinicia y en despliegues multi-instancia no se comparte, lo
 * cual se acepta en el MVP mono-instancia y queda como deuda registrada. La
 * alternativa (Redis) implicaría infraestructura nueva sin respaldo de una
 * necesidad real. Si alguna vez esto pasa a ser un control de seguridad real,
 * hay que moverlo a almacenamiento compartido ANTES de depender de él.
 */
interface ThrottleEntry {
  count: number;
  resetAt: number;
}

export class MailSendThrottle {
  private readonly entries = new Map<string, ThrottleEntry>();

  constructor(
    private readonly maxPerWindow: number,
    private readonly windowMs: number,
  ) {}

  /**
   * Registra un intento y devuelve si está permitido. El llamador IGNORA el
   * resultado en la respuesta HTTP: solo decide si envía o no.
   */
  tryAcquire(key: string): boolean {
    const now = Date.now();
    const entry = this.entries.get(key);

    if (!entry || now >= entry.resetAt) {
      this.entries.set(key, { count: 1, resetAt: now + this.windowMs });
      this.evictExpired(now);
      return true;
    }

    if (entry.count >= this.maxPerWindow) return false;

    entry.count += 1;
    return true;
  }

  /**
   * Poda perezosamente. Sin esto el Map crece sin límite con cada email
   * distinto que se consulta, que es exactamente el vector de abuso que este
   * throttler intenta limitar.
   */
  private evictExpired(now: number): void {
    if (this.entries.size < 1000) return;
    for (const [key, entry] of this.entries) {
      if (now >= entry.resetAt) this.entries.delete(key);
    }
  }
}
