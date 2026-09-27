import { createTransport } from 'nodemailer';
import { MailService } from './mail.service';

// Mock nodemailer so tests never attempt a real SMTP connection.
jest.mock('nodemailer', () => {
  const sendMail = jest.fn().mockResolvedValue({ messageId: 'mocked' });
  return {
    createTransport: jest.fn(() => ({ sendMail })),
  };
});

// Mock envs before the service imports it, to avoid Joi validation failure
// and to control FRONTEND_URL/API_URL deliberately.
jest.mock('../../config/envs', () => ({
  envs: {
    SMTP_HOST: 'smtp.test.com',
    SMTP_PORT: 587,
    SMTP_USER: 'user',
    SMTP_PASS: 'pass',
    SMTP_FROM: 'no-reply@test.com',
    FRONTEND_URL: 'https://app.followapp.test',
    API_URL: 'https://api.followapp.test',
    VERIFICATION_TOKEN_EXPIRY_HOURS: 24,
    // Secure default: el test verifica explícitamente que NO se degrade.
    SMTP_REJECT_UNAUTHORIZED: true,
    SMTP_CONNECTION_TIMEOUT_MS: 15000,
    SMTP_GREETING_TIMEOUT_MS: 15000,
    SMTP_SOCKET_TIMEOUT_MS: 30000,
    SMTP_RETRY_ATTEMPTS: 3,
    // 1ms para que los reintentos no hagan esperar al suite.
    SMTP_RETRY_BASE_DELAY_MS: 1,
  },
}));

describe('MailService', () => {
  let service: MailService;
  let sendMailMock: jest.Mock;
  let transportOptions: Record<string, unknown>;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new MailService();
    const transport = (createTransport as unknown as jest.Mock).mock.results[0]
      .value as { sendMail: jest.Mock };
    sendMailMock = transport.sendMail;
    transportOptions = (createTransport as unknown as jest.Mock).mock
      .calls[0][0] as Record<string, unknown>;
  });

  describe('transport security', () => {
    it('verifica el certificado TLS por default (no disables MITM protection)', () => {
      expect(transportOptions.tls).toEqual({ rejectUnauthorized: true });
    });

    it('exige STARTTLS en el puerto de submission para no mandar credenciales en claro', () => {
      expect(transportOptions.requireTLS).toBe(true);
    });

    it('configura timeouts para que un relay colgado no retenga el listener indefinidamente', () => {
      expect(transportOptions.connectionTimeout).toBe(15000);
      expect(transportOptions.greetingTimeout).toBe(15000);
      expect(transportOptions.socketTimeout).toBe(30000);
    });
  });

  describe('D-109: la frontera de error nunca lanza', () => {
    it('devuelve ok:true con messageId cuando el handshake SMTP funciona', async () => {
      sendMailMock.mockResolvedValue({ messageId: 'id-1' });

      const result = await service.sendVerificationEmail(
        'user@example.com',
        'tok',
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.messageId).toBe('id-1');
        expect(result.attempts).toBe(1);
      }
    });

    it('NO propaga la excepción SMTP al llamador', async () => {
      sendMailMock.mockRejectedValue(
        Object.assign(new Error('Connection timeout'), { code: 'ETIMEDOUT' }),
      );

      // La promesa RESUELVE, no rechaza: de esto depende que ningún comando
      // pueda responder 5xx por un fallo de email.
      await expect(
        service.sendWelcomeEmail('user@example.com', 'Juan'),
      ).resolves.toBeDefined();
    });
  });

  describe('D-113: clasificación transitorio vs permanente', () => {
    it('reintenta un timeout de red y devuelve failed con el código', async () => {
      sendMailMock.mockRejectedValue(
        Object.assign(new Error('Connection timeout'), { code: 'ETIMEDOUT' }),
      );

      const result = await service.sendWelcomeEmail('user@example.com', 'Juan');

      expect(result.ok).toBe(false);
      // 3 intentos = el default de SMTP_RETRY_ATTEMPTS.
      expect(sendMailMock).toHaveBeenCalledTimes(3);
      if (!result.ok) {
        expect(result.code).toBe('ETIMEDOUT');
        expect(result.permanent).toBe(false);
        expect(result.attempts).toBe(3);
      }
    });

    it('NO reintenta un rechazo permanente (buzón inexistente, 550)', async () => {
      sendMailMock.mockRejectedValue(
        Object.assign(new Error('Recipient not found'), { responseCode: 550 }),
      );

      const result = await service.sendWelcomeEmail('user@example.com', 'Juan');

      // Un solo intento: insistir no cambia un 550.
      expect(sendMailMock).toHaveBeenCalledTimes(1);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe('550');
        expect(result.permanent).toBe(true);
      }
    });

    it('reintenta un 421 del servidor: throttling es transitorio pese a ser 4xx', async () => {
      sendMailMock.mockRejectedValue(
        Object.assign(new Error('Too many connections'), { responseCode: 421 }),
      );

      const result = await service.sendWelcomeEmail('user@example.com', 'Juan');

      expect(sendMailMock).toHaveBeenCalledTimes(3);
      if (!result.ok) {
        expect(result.permanent).toBe(false);
      }
    });

    it('reintenta un 452 por almacenamiento insuficiente: 4xx es transitorio por RFC 5321', async () => {
      sendMailMock.mockRejectedValue(
        Object.assign(new Error('Insufficient storage'), { responseCode: 452 }),
      );

      const result = await service.sendWelcomeEmail('user@example.com', 'Juan');

      expect(sendMailMock).toHaveBeenCalledTimes(3);
      if (!result.ok) {
        expect(result.permanent).toBe(false);
      }
    });

    it('NO reintenta un 554: RFC 5321 define 5xx como permanente', async () => {
      sendMailMock.mockRejectedValue(
        Object.assign(new Error('Transaction failed'), { responseCode: 554 }),
      );

      const result = await service.sendWelcomeEmail('user@example.com', 'Juan');

      // Corregido tras detectar la regresion: un 5xx "parecido a error de
      // servidor" sigue siendo permanente. Reintentarlo desperdicia entrega
      // y tiempo de backoff sin cambiar el resultado.
      expect(sendMailMock).toHaveBeenCalledTimes(1);
      if (!result.ok) {
        expect(result.permanent).toBe(true);
      }
    });

    it('recupera en un reintento posterior sin reportar fallo (el caso del relé inestable)', async () => {
      sendMailMock
        .mockRejectedValueOnce(
          Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' }),
        )
        .mockResolvedValueOnce({ messageId: 'id-2' });

      const result = await service.sendWelcomeEmail('user@example.com', 'Juan');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.messageId).toBe('id-2');
        expect(result.attempts).toBe(2);
      }
    });

    it('reenvía el MISMO token en cada reintento: el enlace nunca queda muerto', async () => {
      sendMailMock.mockRejectedValue(
        Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' }),
      );

      await service.sendVerificationEmail('user@example.com', 'token-fijo');

      const bodies = sendMailMock.mock.calls.map((c) => c[0].html);
      expect(bodies).toHaveLength(3);
      for (const body of bodies) {
        expect(body).toContain('token-fijo');
      }
    });
  });

  describe('PII y secretos en logs', () => {
    it('enmascara el destinatario en el resultado devuelto al llamador', async () => {
      sendMailMock.mockResolvedValue({ messageId: 'id-1' });

      const result = await service.sendWelcomeEmail(
        'juan.perez@correo.com',
        'Juan',
      );

      expect(result.recipient).toBe('ju***@correo.com');
      expect(JSON.stringify(result)).not.toContain('juan.perez');
    });

    it('nunca incluye el token en el resultado', async () => {
      sendMailMock.mockResolvedValue({ messageId: 'id-1' });

      const result = await service.sendDealershipInvitationEmail(
        'owner@correo.com',
        'Concesionaria Norte',
        'TOKEN_SECRETO',
      );

      expect(JSON.stringify(result)).not.toContain('TOKEN_SECRETO');
    });
  });

  describe('health', () => {
    it('reporta configurado cuando hay transporter', () => {
      expect(service.isConfigured()).toBe(true);
    });
  });

  describe('links de plantillas (decisiones vigentes)', () => {
    it('builds the verification link with FRONTEND_URL and the frontend page path (D-034)', async () => {
      await service.sendVerificationEmail('user@example.com', 'token-abc');

      expect(sendMailMock).toHaveBeenCalledTimes(1);
      const payload = sendMailMock.mock.calls[0][0];
      expect(payload.to).toBe('user@example.com');
      expect(payload.html).toContain(
        'https://app.followapp.test/verify-email?token=token-abc',
      );
    });

    it('does not point the verification link at the backend API (D-034)', async () => {
      await service.sendVerificationEmail('user@example.com', 'token-abc');

      const payload = sendMailMock.mock.calls[0][0];
      expect(payload.html).not.toContain(
        'https://api.followapp.test/auth/verify-email',
      );
      expect(payload.html).not.toContain('http://localhost:3001');
    });

    it('keeps the password reset link pointing to FRONTEND_URL/reset-password (D-028)', async () => {
      await service.sendPasswordResetEmail('user@example.com', 'reset-token');

      const payload = sendMailMock.mock.calls[0][0];
      expect(payload.html).toContain(
        'https://app.followapp.test/reset-password?token=reset-token',
      );
    });

    it('incluye ?kind=dealership en el link del mail de invitación de concesionaria (D-106)', async () => {
      await service.sendDealershipInvitationEmail(
        'a@b.com',
        'Concesionaria Norte',
        'token-abc',
      );

      const payload = sendMailMock.mock.calls[0][0];
      expect(payload.html).toContain(
        'https://app.followapp.test/invitations/token-abc?kind=dealership',
      );
      expect(payload.html).not.toContain('?kind=workshop');
    });

    it('incluye ?kind=workshop en el link del mail de invitación de taller (D-106)', async () => {
      await service.sendWorkshopInvitationEmail(
        'a@b.com',
        'Taller Norte',
        'token-abc',
      );

      const payload = sendMailMock.mock.calls[0][0];
      expect(payload.html).toContain(
        'https://app.followapp.test/invitations/token-abc?kind=workshop',
      );
      expect(payload.html).not.toContain('?kind=dealership');
    });

    it('mantiene la ruta /invitations/{token} y no mueve el token a query params (D-106)', async () => {
      await service.sendDealershipInvitationEmail('a@b.com', 'D', 'token-abc');
      await service.sendWorkshopInvitationEmail('a@b.com', 'W', 'token-abc');

      const payloads = sendMailMock.mock.calls.map((c) => c[0]);
      expect(payloads.length).toBe(2);
      for (const payload of payloads) {
        expect(payload.html).toContain(
          'https://app.followapp.test/invitations/token-abc?kind=',
        );
        expect(payload.html).not.toContain('?token=');
      }
    });

    it('usa la marca oficial Autentia en todos los mails (decisión PM de marca)', async () => {
      await service.sendVerificationEmail('a@b.com', 'tok');
      await service.sendPasswordResetEmail('a@b.com', 'tok');
      await service.sendPasswordResetCompletedEmail('a@b.com');
      await service.sendWelcomeEmail('a@b.com', 'N');
      await service.sendTransferRequestEmail(
        'a@b.com',
        'A',
        'B',
        'V',
        'AB-123',
      );
      await service.sendTransferAcceptedEmail(
        'a@b.com',
        'A',
        'B',
        'V',
        'AB-123',
      );
      await service.sendTransferQrExpiredEmail('a@b.com', 'A', 'V', 'AB-123');
      await service.sendDealershipInvitationEmail('a@b.com', 'D', 'tok');
      await service.sendDealershipClaimedEmail('a@b.com', 'D');
      await service.sendUserInvitationEmail('a@b.com', 'Admin', 'tok');
      await service.sendUserRoleAssignedEmail('a@b.com', 'Admin');

      const payloads = sendMailMock.mock.calls.map((c) => c[0]);
      expect(payloads.length).toBe(11);
      for (const payload of payloads) {
        const copy = `${payload.subject} ${payload.html}`;
        expect(copy).toContain('Autentia');
        expect(copy).not.toContain('FollowApp');
      }
    });
  });
});
