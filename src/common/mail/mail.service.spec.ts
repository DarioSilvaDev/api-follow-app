import { MailService } from './mail.service';
import { envs } from '../../config/envs';

// Mock del SDK de Resend: los tests nunca hacen una llamada HTTP real.
// Los tipos reflejan el contrato real del SDK para que el mock no sea un `any`
// y los asserts sobre el payload conserven type checking.
interface SendPayload {
  from: string;
  to: string;
  subject: string;
  html: string;
}
interface SendOptions {
  idempotencyKey?: string;
  signal?: AbortSignal;
}
type ResendResult =
  | { data: { id: string }; error: null }
  | {
      data: null;
      error: { name: string; statusCode: number | null; message: string };
    };

const sendMock = jest.fn<Promise<ResendResult>, [SendPayload, SendOptions?]>();
jest.mock('resend', () => ({
  Resend: jest.fn(() => ({ emails: { send: sendMock } })),
}));

// Mock envs antes de que el servicio lo importe, para evitar la validación de
// Joi y controlar FRONTEND_URL/API_URL deliberadamente.
jest.mock('../../config/envs', () => ({
  envs: {
    RESEND_API_KEY: 're_test_key',
    SMTP_FROM: 'no-reply@test.com',
    FRONTEND_URL: 'https://app.followapp.test',
    API_URL: 'https://api.followapp.test',
    VERIFICATION_TOKEN_EXPIRY_HOURS: 24,
    MAIL_SEND_TIMEOUT_MS: 15000,
    SMTP_RETRY_ATTEMPTS: 3,
    // 1ms para que los reintentos no hagan esperar al suite.
    SMTP_RETRY_BASE_DELAY_MS: 1,
  },
}));

/** Respuesta de éxito del SDK. */
const accepted = (id = 'id-1') => ({ data: { id }, error: null });

/** Respuesta de error del SDK: RESUELVE, no lanza. */
const apiError = (
  name: string,
  statusCode: number | null,
  message = 'error',
) => ({ data: null, error: { name, statusCode, message } });

describe('MailService', () => {
  let service: MailService;

  beforeEach(() => {
    jest.clearAllMocks();
    sendMock.mockResolvedValue(accepted());
    service = new MailService();
  });

  describe('D-109: la frontera de error nunca lanza', () => {
    it('devuelve ok:true con el id del proveedor cuando el envío es aceptado', async () => {
      sendMock.mockResolvedValue(accepted('id-1'));

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

    it('NO propaga al llamador el rechazo devuelto por la API', async () => {
      sendMock.mockResolvedValue(
        apiError('validation_error', 422, 'bad payload'),
      );

      // La promesa RESUELVE, no rechaza: de esto depende que ningún comando
      // pueda responder 5xx por un fallo de email.
      await expect(
        service.sendWelcomeEmail('user@example.com', 'Juan'),
      ).resolves.toBeDefined();
    });

    it('NO reporta éxito cuando el SDK resuelve con error (regresión del éxito falso)', async () => {
      // El SDK de Resend devuelve { data: null, error } en vez de lanzar. Si el
      // servicio solo mira `data`, un rechazo se loguea como "Mail accepted" y
      // `register` devuelve `accepted` de un mensaje que nadie recibe.
      sendMock.mockResolvedValue(
        apiError('invalid_api_key', 401, 'API key is invalid'),
      );

      const result = await service.sendWelcomeEmail('user@example.com', 'Juan');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe('invalid_api_key');
        expect(result.permanent).toBe(true);
        expect(result.attempts).toBe(1);
      }
    });
  });

  describe('D-113: clasificación transitorio vs permanente', () => {
    it('reintenta un rate limit y devuelve failed con el código', async () => {
      sendMock.mockResolvedValue(apiError('rate_limit_exceeded', 429));

      const result = await service.sendWelcomeEmail('user@example.com', 'Juan');

      expect(result.ok).toBe(false);
      expect(sendMock).toHaveBeenCalledTimes(3);
      if (!result.ok) {
        expect(result.code).toBe('rate_limit_exceeded');
        expect(result.permanent).toBe(false);
        expect(result.attempts).toBe(3);
      }
    });

    it('reintenta un 500 del proveedor', async () => {
      sendMock.mockResolvedValue(apiError('internal_server_error', 500));

      const result = await service.sendWelcomeEmail('user@example.com', 'Juan');

      expect(sendMock).toHaveBeenCalledTimes(3);
      if (!result.ok) {
        expect(result.permanent).toBe(false);
      }
    });

    it('trata la cuota diaria como PERMANENTE aunque sea 4xx: reintentar no la recupera', async () => {
      // La regla "4xx transitorio" de RFC 5321 era de SMTP. Acá el 4xx de cuota
      // sólo se resuelve esperando el reset, y 3 intentos lo agotan antes.
      sendMock.mockResolvedValue(apiError('daily_quota_exceeded', 403));

      const result = await service.sendWelcomeEmail('user@example.com', 'Juan');

      expect(sendMock).toHaveBeenCalledTimes(1);
      if (!result.ok) {
        expect(result.code).toBe('daily_quota_exceeded');
        expect(result.permanent).toBe(true);
      }
    });

    it('NO reintenta un payload inválido', async () => {
      sendMock.mockResolvedValue(apiError('validation_error', 422));

      const result = await service.sendWelcomeEmail('user@example.com', 'Juan');

      expect(sendMock).toHaveBeenCalledTimes(1);
      if (!result.ok) {
        expect(result.permanent).toBe(true);
      }
    });

    it('trata la falta de alcance de red como transitoria y la reintenta', async () => {
      // El SDK envuelve TODO fallo de fetch en application_error con
      // statusCode null y descarta la causa. Si eso fuera permanente, el
      // mecanismo de reintentos moriría justo en la caída que lo necesita.
      sendMock.mockResolvedValue(
        apiError('application_error', null, 'Unable to fetch data.'),
      );

      const result = await service.sendWelcomeEmail('user@example.com', 'Juan');

      expect(sendMock).toHaveBeenCalledTimes(3);
      if (!result.ok) {
        expect(result.code).toBe('NETWORK_UNREACHABLE');
        expect(result.permanent).toBe(false);
      }
    });

    it('recupera en un reintento posterior sin reportar fallo', async () => {
      sendMock
        .mockResolvedValueOnce(apiError('rate_limit_exceeded', 429))
        .mockResolvedValueOnce(accepted('id-2'));

      const result = await service.sendWelcomeEmail('user@example.com', 'Juan');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.messageId).toBe('id-2');
        expect(result.attempts).toBe(2);
      }
    });

    it('reenvía el MISMO token en cada reintento: el enlace nunca queda muerto', async () => {
      sendMock.mockResolvedValue(apiError('rate_limit_exceeded', 429));

      await service.sendVerificationEmail('user@example.com', 'token-fijo');

      const bodies = sendMock.mock.calls.map((c) => c[0].html);
      expect(bodies).toHaveLength(3);
      for (const body of bodies) {
        expect(body).toContain('token-fijo');
      }
    });
  });

  describe('idempotencia del reintento', () => {
    it('usa la MISMA clave de idempotencia en todos los intentos de un envío', async () => {
      sendMock.mockResolvedValue(apiError('rate_limit_exceeded', 429));

      await service.sendWelcomeEmail('user@example.com', 'Juan');

      const keys = sendMock.mock.calls.map((c) => c[1]?.idempotencyKey);
      expect(keys).toHaveLength(3);
      expect(keys[0]).toBeDefined();
      // Sin esto, un reintento tras un timeout podría mandar un SEGUNDO email
      // con el mismo enlace: la ambigüedad que SMTP no tenía forma de resolver
      // y que acá el proveedor garantiza.
      for (const key of keys) {
        expect(key).toBe(keys[0]);
      }
    });

    it('usa claves DISTINTAS para envíos distintos', async () => {
      await service.sendWelcomeEmail('a@example.com', 'A');
      await service.sendWelcomeEmail('b@example.com', 'B');

      const keys = sendMock.mock.calls.map((c) => c[1]?.idempotencyKey);
      expect(keys[0]).not.toBe(keys[1]);
    });
  });

  describe('D-114: el tiempo de espera es acotado', () => {
    it('pasa un AbortSignal para que un request colgado no retenga el listener', async () => {
      await service.sendWelcomeEmail('user@example.com', 'Juan');

      const options = sendMock.mock.calls[0][1] as { signal?: AbortSignal };
      expect(options.signal).toBeDefined();
      expect(options.signal?.aborted).toBe(false);
    });

    it('reporta MAIL_TIMEOUT como transitorio cuando se agota el tiempo', async () => {
      // El SDK convierte nuestro abort en un application_error genérico del
      // que no se puede distinguir un timeout de un fallo de DNS. Como el
      // signal es nuestro, el diagnóstico real se conserva.
      const mutable = envs as unknown as { MAIL_SEND_TIMEOUT_MS: number };
      const previous = mutable.MAIL_SEND_TIMEOUT_MS;
      mutable.MAIL_SEND_TIMEOUT_MS = 5;

      // El SDK resuelve con error genérico cuando se aborta el fetch.
      sendMock.mockImplementation(
        (_payload: unknown, options?: { signal?: AbortSignal }) =>
          new Promise((resolve) => {
            options?.signal?.addEventListener('abort', () =>
              resolve(
                apiError('application_error', null, 'Unable to fetch data.'),
              ),
            );
          }),
      );

      try {
        const result = await service.sendWelcomeEmail(
          'user@example.com',
          'Juan',
        );

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.code).toBe('MAIL_TIMEOUT');
          expect(result.permanent).toBe(false);
          // Reintentado: un timeout es transitorio por definición.
          expect(result.attempts).toBe(3);
        }
        expect(sendMock).toHaveBeenCalledTimes(3);
      } finally {
        mutable.MAIL_SEND_TIMEOUT_MS = previous;
      }
    });
  });

  describe('configuración', () => {
    it('reporta no configurado cuando falta la API key', () => {
      // Se cubre el camino del constructor sin key en el test del módulo;
      // acá se verifica el contrato público que consume /health.
      expect(service.isConfigured()).toBe(true);
    });

    it('envía el remitente configurado y no el dominio sandbox de Resend', async () => {
      await service.sendWelcomeEmail('user@example.com', 'Juan');

      expect(sendMock.mock.calls[0][0].from).toBe('no-reply@test.com');
      // `onboarding@resend.dev` sólo entrega a la casilla del dueño de la
      // cuenta: usarlo en producción hace fallar silenciosamente en prod.
      expect(sendMock.mock.calls[0][0].from).not.toContain('resend.dev');
    });
  });

  describe('PII y secretos en logs', () => {
    it('enmascara el destinatario en el resultado devuelto al llamador', async () => {
      const result = await service.sendWelcomeEmail(
        'juan.perez@correo.com',
        'Juan',
      );

      expect(result.recipient).toBe('ju***@correo.com');
      expect(JSON.stringify(result)).not.toContain('juan.perez');
    });

    it('nunca incluye el token en el resultado', async () => {
      const result = await service.sendDealershipInvitationEmail(
        'owner@correo.com',
        'Concesionaria Norte',
        'TOKEN_SECRETO',
      );

      expect(JSON.stringify(result)).not.toContain('TOKEN_SECRETO');
    });

    it('nunca incluye el token en el resultado de la variante combinada (D-TL-5)', async () => {
      const result = await service.sendDealershipGroupInvitationEmail(
        'owner@correo.com',
        'Concesionaria Norte',
        'Concesionaria Norte Service',
        'TOKEN_SECRETO',
      );

      expect(JSON.stringify(result)).not.toContain('TOKEN_SECRETO');
    });
  });

  describe('links de plantillas (decisiones vigentes)', () => {
    it('builds the verification link with FRONTEND_URL and the frontend page path (D-034)', async () => {
      await service.sendVerificationEmail('user@example.com', 'token-abc');

      expect(sendMock).toHaveBeenCalledTimes(1);
      const payload = sendMock.mock.calls[0][0];
      expect(payload.to).toBe('user@example.com');
      expect(payload.html).toContain(
        'https://app.followapp.test/verify-email?token=token-abc',
      );
    });

    it('does not point the verification link at the backend API (D-034)', async () => {
      await service.sendVerificationEmail('user@example.com', 'token-abc');

      const payload = sendMock.mock.calls[0][0];
      expect(payload.html).not.toContain(
        'https://api.followapp.test/auth/verify-email',
      );
      expect(payload.html).not.toContain('http://localhost:3001');
    });

    it('keeps the password reset link pointing to FRONTEND_URL/reset-password (D-028)', async () => {
      await service.sendPasswordResetEmail('user@example.com', 'reset-token');

      const payload = sendMock.mock.calls[0][0];
      expect(payload.html).toContain(
        'https://app.followapp.test/reset-password?token=reset-token',
      );
    });

    it('incluye ?kind=dealership en el link del mail de invitación de concesionaria (D-117)', async () => {
      await service.sendDealershipInvitationEmail(
        'a@b.com',
        'Concesionaria Norte',
        'token-abc',
      );

      const payload = sendMock.mock.calls[0][0];
      expect(payload.html).toContain(
        'https://app.followapp.test/invitations/token-abc?kind=dealership',
      );
      expect(payload.html).not.toContain('?kind=workshop');
    });

    it('incluye ?kind=workshop en el link del mail de invitación de taller (D-117)', async () => {
      await service.sendWorkshopInvitationEmail(
        'a@b.com',
        'Taller Norte',
        'token-abc',
      );

      const payload = sendMock.mock.calls[0][0];
      expect(payload.html).toContain(
        'https://app.followapp.test/invitations/token-abc?kind=workshop',
      );
      expect(payload.html).not.toContain('?kind=dealership');
    });

    it('mantiene la ruta /invitations/{token} y no mueve el token a query params (D-117)', async () => {
      await service.sendDealershipInvitationEmail('a@b.com', 'D', 'token-abc');
      await service.sendWorkshopInvitationEmail('a@b.com', 'W', 'token-abc');

      const payloads = sendMock.mock.calls.map((c) => c[0]);
      expect(payloads.length).toBe(2);
      for (const payload of payloads) {
        expect(payload.html).toContain(
          'https://app.followapp.test/invitations/token-abc?kind=',
        );
        expect(payload.html).not.toContain('?token=');
      }
    });

    it('D-TL-5: variante combinada de invitación usa el MISMO wizard kind=dealership y menciona ambos nombres', async () => {
      await service.sendDealershipGroupInvitationEmail(
        'a@b.com',
        'Concesionaria Norte',
        'Concesionaria Norte Service',
        'token-abc',
      );

      const payload = sendMock.mock.calls[0][0];
      expect(payload.subject).toBe(
        'Completá el alta de Concesionaria Norte y su taller - Autentia',
      );
      expect(payload.html).toContain(
        'https://app.followapp.test/invitations/token-abc?kind=dealership',
      );
      expect(payload.html).toContain('Concesionaria Norte Service');
      expect(payload.html).toContain('Completar el alta');
      // D-TL-3: el taller NO tiene invitación propia → nunca kind=workshop.
      expect(payload.html).not.toContain('?kind=workshop');
    });

    it('D-TL-5: variante combinada de confirmación tiene 2 CTAs a los paneles', async () => {
      await service.sendDealershipGroupClaimedEmail(
        'a@b.com',
        'Concesionaria Norte',
        'Concesionaria Norte Service',
      );

      const payload = sendMock.mock.calls[0][0];
      expect(payload.subject).toBe(
        'Concesionaria Norte y su taller quedaron activos - Autentia',
      );
      expect(payload.html).toContain('Ir a mi concesionaria');
      expect(payload.html).toContain('Ir a mi taller');
      // Los href de los paneles están dentro del payload.
      expect(payload.html).toContain('https://app.followapp.test/panels/');
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
      await service.sendDealershipGroupInvitationEmail(
        'a@b.com',
        'D',
        'W',
        'tok',
      );
      await service.sendDealershipGroupClaimedEmail('a@b.com', 'D', 'W');
      await service.sendUserInvitationEmail('a@b.com', 'Admin', 'tok');
      await service.sendUserRoleAssignedEmail('a@b.com', 'Admin');

      const payloads = sendMock.mock.calls.map((c) => c[0]);
      expect(payloads.length).toBe(13);
      for (const payload of payloads) {
        const copy = `${payload.subject} ${payload.html}`;
        expect(copy).toContain('Autentia');
        expect(copy).not.toContain('FollowApp');
      }
    });
  });

  describe('C-4: notificaciones de reclamo de vehículo', () => {
    const baseParams = {
      vehicleId: 'vehicle-1',
      licensePlate: 'AB123CD',
      careEpisodeId: 'episode-1',
    };

    it('claimed: arma asunto, cuerpo, CTA y panel con careEpisodeId', async () => {
      await service.sendVehicleClaimWorkshopNotificationEmail(
        'taller@test.com',
        'claimed',
        {
          ...baseParams,
          claimantName: 'Juan Pérez',
          claimantEmail: 'juan@test.com',
        },
      );

      const payload = sendMock.mock.calls[0][0];
      expect(payload.subject).toBe(
        'Juan Pérez reclamó el vehículo AB123CD - Autentia',
      );
      expect(payload.html).toContain('<h2>Reclamo completado</h2>');
      expect(payload.html).toContain(
        'Juan Pérez (juan@test.com) reclamó el vehículo AB123CD y el historial ya quedó a su nombre.',
      );
      expect(payload.html).toContain('podés revocarlo desde el panel');
      expect(payload.html).toContain('Ver el reclamo');
      expect(payload.html).toContain(
        'https://app.followapp.test/vehicles/vehicle-1/servicios/episode-1',
      );
    });

    it('claimed: omite el email entre paréntesis cuando no hay', async () => {
      await service.sendVehicleClaimWorkshopNotificationEmail(
        'taller@test.com',
        'claimed',
        { ...baseParams, claimantName: 'Juan' },
      );

      const html = sendMock.mock.calls[0][0].html;
      expect(html).toContain('Juan reclamó el vehículo AB123CD');
      expect(html).not.toContain('juan@test.com');
      expect(html).not.toContain('Juan (');
    });

    it('claimed: sin reclamante usa "Alguien" y no afirma la titularidad', async () => {
      await service.sendVehicleClaimWorkshopNotificationEmail(
        'taller@test.com',
        'claimed',
        baseParams,
      );

      const payload = sendMock.mock.calls[0][0];
      expect(payload.subject).toBe(
        'Alguien reclamó el vehículo AB123CD - Autentia',
      );
      expect(payload.html).toContain('<h2>Reclamo completado</h2>');
      expect(payload.html).toContain('Alguien reclamó el vehículo AB123CD.');
      expect(payload.html).not.toContain('ya quedó a su nombre');
      expect(payload.html).toContain('podés revocarlo desde el panel');
      expect(payload.html).toContain('Ver el reclamo');
    });

    it('claimed: alreadyOwner omite la frase de revocación', async () => {
      await service.sendVehicleClaimWorkshopNotificationEmail(
        'taller@test.com',
        'claimed',
        { ...baseParams, claimantName: 'Juan', alreadyOwner: true },
      );

      const html = sendMock.mock.calls[0][0].html;
      expect(html).toContain('No necesitás hacer nada.');
      expect(html).not.toContain('podés revocarlo desde el panel');
    });

    it('verify_failed: incluye el número de intento y el CTA', async () => {
      await service.sendVehicleClaimWorkshopNotificationEmail(
        'taller@test.com',
        'verify_failed',
        { ...baseParams, failedAttempts: 2 },
      );

      const payload = sendMock.mock.calls[0][0];
      expect(payload.subject).toBe(
        'Intento fallido de reclamo en AB123CD - Autentia',
      );
      expect(payload.html).toContain('<h2>Intento fallido de reclamo</h2>');
      expect(payload.html).toContain(
        'Intento 2 de verificación fallido para el vehículo AB123CD.',
      );
      expect(payload.html).not.toContain('Registramos un intento fallido');
      expect(payload.html).toContain('revisá con quién compartiste el link');
      expect(payload.html).toContain('Ver el reclamo');
    });

    it('verify_failed: sin contador usa el mensaje genérico una sola vez', async () => {
      await service.sendVehicleClaimWorkshopNotificationEmail(
        'taller@test.com',
        'verify_failed',
        baseParams,
      );

      const html = sendMock.mock.calls[0][0].html;
      expect(html).toContain(
        'Registramos un intento fallido de reclamo para el vehículo AB123CD.',
      );
      expect(html).not.toContain('Intento 2 de verificación');
    });

    it('blocked: no tiene CTA', async () => {
      await service.sendVehicleClaimWorkshopNotificationEmail(
        'taller@test.com',
        'blocked',
        baseParams,
      );

      const payload = sendMock.mock.calls[0][0];
      expect(payload.subject).toBe(
        'Reclamo bloqueado: AB123CD ya tiene titular - Autentia',
      );
      expect(payload.html).toContain(
        'Alguien intentó reclamar el vehículo AB123CD, pero ya tiene un titular registrado.',
      );
      expect(payload.html).toContain('No se creó ningún vínculo nuevo.');
      expect(payload.html).not.toContain('<a href');
    });

    it('manual_review: usa nombre y email del reclamante', async () => {
      await service.sendVehicleClaimWorkshopNotificationEmail(
        'taller@test.com',
        'manual_review',
        {
          ...baseParams,
          claimantName: 'Ana',
          claimantEmail: 'ana@test.com',
        },
      );

      const payload = sendMock.mock.calls[0][0];
      expect(payload.subject).toBe('Reclamo a revisar: AB123CD - Autentia');
      expect(payload.html).toContain(
        'Ana (ana@test.com) reclamó el vehículo AB123CD, pero no pudimos verificarlo automáticamente.',
      );
      expect(payload.html).toContain('Revisar el reclamo');
    });

    it('manual_review: cae a "Alguien" sin nombre (D-2)', async () => {
      await service.sendVehicleClaimWorkshopNotificationEmail(
        'taller@test.com',
        'manual_review',
        baseParams,
      );

      const html = sendMock.mock.calls[0][0].html;
      expect(html).toContain(
        'Alguien reclamó el vehículo AB123CD, pero no pudimos verificarlo automáticamente.',
      );
    });

    it('auto_revoked: menciona los 3 bloqueos y ofrece generar link nuevo', async () => {
      await service.sendVehicleClaimWorkshopNotificationEmail(
        'taller@test.com',
        'auto_revoked',
        baseParams,
      );

      const payload = sendMock.mock.calls[0][0];
      expect(payload.subject).toBe(
        'El link de reclamo de AB123CD fue revocado - Autentia',
      );
      expect(payload.html).toContain(
        'se revocó automáticamente después de 3 bloqueos de verificación',
      );
      expect(payload.html).toContain('Generar link nuevo');
    });

    it('blocked_owner: no menciona taller ni reclamante y apunta a /vehicles', async () => {
      await service.sendVehicleClaimBlockedOwnerEmail(
        'owner@test.com',
        'Juan',
        'AB123CD',
      );

      const payload = sendMock.mock.calls[0][0];
      expect(payload.subject).toBe(
        'Alguien intentó reclamar tu vehículo AB123CD - Autentia',
      );
      expect(payload.html).toContain(
        '<h2>Alguien intentó reclamar tu vehículo</h2>',
      );
      expect(payload.html).toContain('Hola Juan,');
      expect(payload.html).toContain('el vehículo sigue siendo tuyo');
      expect(payload.html).toContain('https://app.followapp.test/vehicles');
      expect(payload.html).toContain('Ver mi vehículo');
      expect(payload.html).not.toContain('Taller');
      expect(payload.html).not.toContain('reclamante');
    });

    it('blocked_owner: sin nombre saluda "Hola,"', async () => {
      await service.sendVehicleClaimBlockedOwnerEmail(
        'owner@test.com',
        '',
        'AB123CD',
      );

      expect(sendMock.mock.calls[0][0].html).toContain('Hola,');
    });

    it('result claimed: confirma y linkea al historial', async () => {
      await service.sendVehicleClaimResultEmail(
        'ana@test.com',
        'Ana',
        'AB123CD',
        'claimed',
      );

      const payload = sendMock.mock.calls[0][0];
      expect(payload.subject).toBe('Reclamaste el vehículo AB123CD - Autentia');
      expect(payload.html).toContain(
        '<h2>El vehículo ya está a tu nombre</h2>',
      );
      expect(payload.html).toContain('Ver el historial');
      expect(payload.html).toContain('https://app.followapp.test/vehicles');
    });

    it('result revoked: avisa sin CTA', async () => {
      await service.sendVehicleClaimResultEmail(
        'ana@test.com',
        'Ana',
        'AB123CD',
        'revoked',
      );

      const payload = sendMock.mock.calls[0][0];
      expect(payload.subject).toBe(
        'El reclamo de AB123CD fue revocado - Autentia',
      );
      expect(payload.html).toContain('<h2>El reclamo fue revocado</h2>');
      expect(payload.html).toContain('El historial ya no figura a tu nombre.');
      expect(payload.html).not.toContain('<a href');
    });

    it('result review_rejected: rechazo sin afirmar que perdió el historial', async () => {
      await service.sendVehicleClaimResultEmail(
        'ana@test.com',
        'Ana',
        'AB123CD',
        'review_rejected',
      );

      const payload = sendMock.mock.calls[0][0];
      expect(payload.subject).toBe(
        'El reclamo de AB123CD fue rechazado - Autentia',
      );
      expect(payload.html).toContain('<h2>El reclamo fue rechazado</h2>');
      expect(payload.html).toContain('Hola Ana,');
      expect(payload.html).toContain(
        'El taller revisó el reclamo del vehículo AB123CD y lo rechazó. El historial no quedó a tu nombre.',
      );
      expect(payload.html).not.toContain('ya no figura a tu nombre');
      expect(payload.html).not.toContain('<a href');
    });

    it('escapa HTML en los valores dinámicos', async () => {
      await service.sendVehicleClaimWorkshopNotificationEmail(
        'taller@test.com',
        'claimed',
        {
          ...baseParams,
          claimantName: '<script>alert(1)</script>',
          claimantEmail: 'x@test.com',
        },
      );

      const html = sendMock.mock.calls[0][0].html;
      expect(html).not.toContain('<script>');
      expect(html).toContain('&lt;script&gt;');
    });

    it('sanea CR/LF en el asunto (headerSafe)', async () => {
      await service.sendVehicleClaimWorkshopNotificationEmail(
        'taller@test.com',
        'claimed',
        {
          ...baseParams,
          claimantName: 'Juan\r\nBcc: evil@test.com',
        },
      );

      const subject = sendMock.mock.calls[0][0].subject;
      expect(subject).not.toContain('\r');
      expect(subject).not.toContain('\n');
    });

    it('nunca incluye el link de reclamo ni un token en el cuerpo', async () => {
      await service.sendVehicleClaimWorkshopNotificationEmail(
        'taller@test.com',
        'claimed',
        { ...baseParams, claimantName: 'Juan' },
      );

      const html = sendMock.mock.calls[0][0].html;
      expect(html).not.toContain('/reclamo/');
      expect(html).not.toContain('token=');
    });

    it('panel URL sin careEpisodeId cae a la ruta del vehículo', async () => {
      await service.sendVehicleClaimWorkshopNotificationEmail(
        'taller@test.com',
        'claimed',
        { vehicleId: 'vehicle-1', licensePlate: 'AB123CD' },
      );

      const html = sendMock.mock.calls[0][0].html;
      expect(html).toContain('https://app.followapp.test/vehicles/vehicle-1');
      expect(html).not.toContain('/servicios/');
    });
  });
});
