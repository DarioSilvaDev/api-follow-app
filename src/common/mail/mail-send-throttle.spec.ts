import { MailSendThrottle } from './mail-send-throttle';

describe('MailSendThrottle', () => {
  it('permite los primeros envios dentro de la ventana', () => {
    const throttle = new MailSendThrottle(3, 60_000);

    expect(throttle.tryAcquire('a@b.com')).toBe(true);
    expect(throttle.tryAcquire('a@b.com')).toBe(true);
    expect(throttle.tryAcquire('a@b.com')).toBe(true);
  });

  it('bloquea una vez agotado el limite', () => {
    const throttle = new MailSendThrottle(2, 60_000);

    throttle.tryAcquire('a@b.com');
    throttle.tryAcquire('a@b.com');

    expect(throttle.tryAcquire('a@b.com')).toBe(false);
    expect(throttle.tryAcquire('a@b.com')).toBe(false);
  });

  it('D-121: el limite es POR destinatario, no global (no permite DoS de otros usuarios)', () => {
    const throttle = new MailSendThrottle(1, 60_000);

    expect(throttle.tryAcquire('a@b.com')).toBe(true);
    expect(throttle.tryAcquire('a@b.com')).toBe(false);

    // El atacante no puede agotar el límite de otra víctima.
    expect(throttle.tryAcquire('victima@b.com')).toBe(true);
  });

  it('libera el espacio cuando expira la ventana', () => {
    jest.useFakeTimers();
    try {
      const throttle = new MailSendThrottle(1, 1000);

      expect(throttle.tryAcquire('a@b.com')).toBe(true);
      expect(throttle.tryAcquire('a@b.com')).toBe(false);

      jest.advanceTimersByTime(1001);

      expect(throttle.tryAcquire('a@b.com')).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });

  it('poda entradas vencidas para que el Map no crezca sin limite', () => {
    jest.useFakeTimers();
    try {
      const throttle = new MailSendThrottle(1, 1000);

      for (let i = 0; i < 1200; i++) {
        throttle.tryAcquire(`user-${i}@b.com`);
      }

      // Tras insertar 1200 entradas, la siguiente llamada dispara la poda.
      jest.advanceTimersByTime(2000);
      throttle.tryAcquire('trigger@b.com');

      // La poda corre solo cuando size >= 1000, sobre lo vencido.
      const internal = (
        throttle as unknown as { entries: Map<string, unknown> }
      ).entries;

      expect(internal.size).toBeLessThan(1200);
    } finally {
      jest.useRealTimers();
    }
  });
});
