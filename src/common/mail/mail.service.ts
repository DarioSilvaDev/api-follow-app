import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Resend } from 'resend';
import type { CreateEmailRequestOptions } from 'resend';
import { envs } from '../../config/envs';
import { maskEmail } from './mask-email';
import {
  MAIL_TEMPLATES,
  MailContext,
  MailSendResult,
  MailTemplate,
} from './mail.types';

/**
 * El SDK de Resend NO lanza excepciones ante un error de API: `emails.send()`
 * resuelve con `{ data: null, error }` y solo se lanza si el propio SDK revienta
 * (verificado en el dist de resend@6.30.0). Ignorar ese `error` hace que un
 * rechazo se reporte como envío exitoso, que es peor que el 503 original: el
 * usuario recibe un "accepted" de un mensaje que nadie va a recibir.
 */

/**
 * Nombres de error de Resend contra los que insistir NO cambia el resultado
 * (D-113, translated to HTTP).
 *
 * La regla canónica ya no puede ser "4xx transitorio, 5xx permanente" de RFC
 * 5321 porque esos códigos son SMTP. En HTTP la semántica cambia: un 429 es
 * transitorio y un 403 por cuota excedida es PERMANENTE hasta que se resetea el
 * periodo, así que un 4xx a secas sería peor que una tabla explícita.
 */
const PERMANENT_ERROR_NAMES = new Set([
  // Credenciales y permisos: solo se arregla en la config del deploy.
  'missing_api_key',
  'invalid_api_key',
  'restricted_api_key',
  'invalid_access',
  'security_error',
  // El payload o el remitente está mal: reintentar reenvía lo mismo que falla.
  'validation_error',
  'missing_required_field',
  'invalid_parameter',
  'invalid_from_address',
  'invalid_attachment',
  'invalid_region',
  'not_found',
  'method_not_allowed',
  // Cuota agotada: se reintenta hasta el reset y el límite de intentos se
  // agota antes. Marcarla transitoria convertiría un rechazo conocido en
  // carga inútil contra la API.
  'daily_quota_exceeded',
  'monthly_quota_exceeded',
  // Clave de idempotencia inválida: es un bug nuestro, no una caída del
  // proveedor. Reintentar con la misma clave no lo va a arreglar.
  'invalid_idempotency_key',
  'invalid_idempotent_request',
]);

/** Nombres de error de Resend que un reintento posterior puede resolver. */
const TRANSIENT_ERROR_NAMES = new Set([
  'rate_limit_exceeded',
  'internal_server_error',
  // El mismo envío lógico sigue en vuelo en el proveedor. Espera y reintenta.
  'concurrent_idempotent_requests',
]);

/** Códigos de red de Node que son transitorios. */
const TRANSIENT_NETWORK_CODES = new Set([
  'ETIMEDOUT',
  'ECONNECTION',
  'ECONNREFUSED',
  'ECONNRESET',
  'ESOCKET',
  'EDNS',
  'EAI_AGAIN',
  'EPIPE',
]);

/**
 * El SDK no tipa `signal`, pero sí lo propaga: `post()` arma
 * `{ method, body, ...options, headers }` y se lo entrega a `fetch`. El cast
 * está acotado a esta forma y verificado contra el dist de resend@6.30.0.
 */
type ResendSendOptions = CreateEmailRequestOptions & { signal?: AbortSignal };

interface MailOptions {
  to: string;
  subject: string;
  html: string;
}

@Injectable()
export class MailService {
  private resendClient: Resend | null = null;
  private readonly logger = new Logger(MailService.name);

  constructor() {
    if (envs.RESEND_API_KEY) {
      this.resendClient = new Resend(envs.RESEND_API_KEY);
    } else {
      this.logger.warn(
        'RESEND_API_KEY not configured. Emails will not be sent.',
      );
    }
  }

  /** T-4: detección de degradación sin depender de un usuario quejándose. */
  isConfigured(): boolean {
    return this.resendClient !== null;
  }

  /**
   * Enmascara el destinatario para los logs. Delega en el helper compartido
   * porque el mismo formato lo necesita `UserInvitationEmailListener` (su
   * evento no transporta ningún id de dominio y su única correlación posible
   * es el email). Un único lugar define el formato.
   */
  private mask(email: string): string {
    return maskEmail(email);
  }

  /**
   * Clasifica el error. Transitorio = reintentable; permanente = insistir no
   * resuelve (D-113).
   *
   * Prioridad de la evidencia, de más a menos específica:
   *   1. `name` de la tabla explícita de Resend.
   *   2. Si abortamos nosotros, el timeout es nuestro y lo sabemos con certeza.
   *   3. Código de red, si la excepción llegó hasta acá con uno.
   *   4. `statusCode` del proveedor, con 429 y 5xx como transitorios.
   *
   * El SDK envuelve TODO fallo de `fetch` (DNS, TCP, TLS, y también nuestro
   * abort) en `{ name: 'application_error', statusCode: null }` y tira el error
   * original. Ese `statusCode: null` es la única señal que distingue "no hubo
   * respuesta HTTP" de "hubo respuesta", y por eso se trata como transitorio:
   * marcarlo permanente dejaría el mecanismo de reintentos muerto justo en la
   * caída de red que más lo necesita.
   */
  private classify(error: unknown): { code: string; permanent: boolean } {
    const err = (error ?? {}) as {
      name?: string;
      code?: string;
      statusCode?: number | null;
    };

    const name = typeof err.name === 'string' ? err.name : undefined;
    const statusCode =
      typeof err.statusCode === 'number' ? err.statusCode : undefined;
    // `null` y `undefined` NO son lo mismo acá: el SDK usa `null` para
    // significar "no hubo respuesta HTTP" y `undefined` para "noApply". Normalizar
    // `null` a `undefined` hacía desaparecer justo la señal que distingue una
    // caída de red de un rechazo del proveedor.
    const noHttpResponse = err.statusCode === null;

    if (name && TRANSIENT_ERROR_NAMES.has(name)) {
      return { code: name, permanent: false };
    }

    if (name && PERMANENT_ERROR_NAMES.has(name)) {
      return { code: name, permanent: true };
    }

    // `TimeoutError` es el nombre que Node da al abort de AbortSignal.timeout();
    // `AbortError` al de un AbortController común.
    if (name === 'TimeoutError' || name === 'AbortError') {
      return { code: 'MAIL_TIMEOUT', permanent: false };
    }

    if (err.code) {
      return {
        code: err.code,
        permanent: !TRANSIENT_NETWORK_CODES.has(err.code),
      };
    }

    if (name === 'application_error' && noHttpResponse) {
      // El SDK descartó la causa real; el código es nuestra inferencia.
      return { code: 'NETWORK_UNREACHABLE', permanent: false };
    }

    if (statusCode !== undefined) {
      return {
        code: statusCode === 429 ? 'RATE_LIMITED' : String(statusCode),
        permanent: !(statusCode === 429 || statusCode >= 500),
      };
    }

    // Sin evidencia en absoluto: se asume transitorio. Reintentar está acotado
    // a 3 intentos y ahora es seguro por la clave de idempotencia, mientras que
    // abandonar ante un error desconocido pierde recoverable.
    return { code: name ?? 'UNKNOWN', permanent: false };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Frontera de error única del envío de email. NO LANZA NUNCA.
   *
   * D-109: el estado de negocio ya está confirmado en BD cuando se llega acá, así
   * que este método no puede propagar el fallo hacia el comando que lo disparó.
   * D-113: el reintento reenvía el MISMO token y el MISMO payload; nunca
   * regenera un token, porque un timeout es ambiguo (el servidor pudo aceptar el
   * mensaje y perder la respuesta) y un token distinto produciría un segundo
   * email con un enlace muerto.
   */
  private async send(
    template: MailTemplate,
    options: MailOptions,
    context: MailContext = {},
  ): Promise<MailSendResult> {
    const recipient = this.mask(options.to);

    if (!this.resendClient) {
      this.logger.error(
        `Mail not sent: provider unconfigured (template=${template}, recipient=${recipient})`,
      );
      return {
        ok: false,
        template,
        recipient,
        code: 'RESEND_NOT_CONFIGURED',
        // Un restart con la variable cargada es lo único que lo arregla:
        // insistir en el mismo proceso no aporta nada.
        permanent: true,
        attempts: 0,
      };
    }

    const maxAttempts = envs.SMTP_RETRY_ATTEMPTS;
    const timeoutMs = envs.MAIL_SEND_TIMEOUT_MS;

    // Un envío lógico = una clave de idempotencia, generada una sola vez y
    // reutilizada por todos los intentos. Es lo que hace seguro el reintento:
    // el proveedor deduplica en vez de mandar un segundo email. Con SMTP esto
    // era imposible de garantizar; acá es una garantía del proveedor.
    const idempotencyKey = randomUUID();

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      // El timeout es nuestro, no del SDK: sin esto el error reportado por el
      // proveedor es genérico y no permite distinguir un timeout de un fallo de
      // DNS. Con el signal a la vista sí.
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const { data, error } = await this.resendClient.emails.send(
          {
            from: envs.SMTP_FROM,
            to: options.to,
            subject: options.subject,
            html: options.html,
          },
          {
            idempotencyKey,
            signal: controller.signal,
          } as ResendSendOptions,
        );

        // El SDK resolvió, pero con error: hay que convertirlo en excepción
        // para que el `catch` de abajo sea el ÚNICO lugar que decide. Un
        // success silencioso acá sería un falso "Mail accepted".
        if (error) {
          const apiError = new Error(error.message) as Error & {
            statusCode: number | null;
          };
          apiError.name = error.name;
          apiError.statusCode = error.statusCode;
          throw apiError;
        }

        this.logger.log(
          `Mail accepted (template=${template}, recipient=${recipient}, attempts=${attempt}, ${this.correlation(context)})`,
        );
        return {
          ok: true,
          template,
          recipient,
          messageId: data?.id,
          attempts: attempt,
        };
      } catch (error) {
        const { code, permanent } = this.classify(
          // Si abortamos nosotros, el SDK ya devolvió un `application_error`
          // genérico; se lo reemplaza por el nuestro, que es preciso.
          controller.signal.aborted ? { name: 'TimeoutError' } : error,
        );

        if (permanent) {
          // Credenciales, remitente, payload o cuota: insistir no cambia el
          // resultado (D-113).
          this.logger.error(
            `Mail rejected permanently (template=${template}, recipient=${recipient}, code=${code}, attempts=${attempt}, ${this.correlation(context)})`,
          );
          return {
            ok: false,
            template,
            recipient,
            code,
            permanent,
            attempts: attempt,
          };
        }

        if (attempt < maxAttempts) {
          // Backoff exponencial con jitter: evita que N invitations que
          // fallan a la vez reintenten en lockstep contra el proveedor caído.
          const base = envs.SMTP_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1);
          const delay = Math.round(base * (0.5 + Math.random()));
          this.logger.warn(
            `Mail attempt failed, retrying (template=${template}, recipient=${recipient}, code=${code}, attempt=${attempt}/${maxAttempts}, retryInMs=${delay}, ${this.correlation(context)})`,
          );
          await this.sleep(delay);
          continue;
        }

        this.logger.error(
          `Mail failed after retries (template=${template}, recipient=${recipient}, code=${code}, attempts=${attempt}, ${this.correlation(context)})`,
        );
        return {
          ok: false,
          template,
          recipient,
          code,
          permanent: false,
          attempts: attempt,
        };
      } finally {
        clearTimeout(timer);
      }
    }

    // inalcanzable en la práctica: el loop siempre retorna.
    return {
      ok: false,
      template,
      recipient,
      code: 'UNKNOWN',
      permanent: false,
      attempts: maxAttempts,
    };
  }

  /** NUNCA incluye el token de ningún tipo (invitación, verificación, reset). */
  private correlation(context: MailContext): string {
    const parts: string[] = [];
    if (context.userId) parts.push(`userId=${context.userId}`);
    if (context.workshopId) parts.push(`workshopId=${context.workshopId}`);
    if (context.dealershipId)
      parts.push(`dealershipId=${context.dealershipId}`);
    if (context.invitationId)
      parts.push(`invitationId=${context.invitationId}`);
    if (context.vehicleId) parts.push(`vehicleId=${context.vehicleId}`);
    return parts.length > 0 ? parts.join(', ') : 'no-context';
  }

  async sendVerificationEmail(
    to: string,
    token: string,
    context?: MailContext,
  ): Promise<MailSendResult> {
    // D-034: the verification link points to the frontend page (which consumes
    // GET /auth/verify-email), consistent with D-028 for password reset.
    const frontendUrl = envs.FRONTEND_URL || 'http://localhost:3000';
    const link = `${frontendUrl}/verify-email?token=${token}`;
    return this.send(
      MAIL_TEMPLATES.EMAIL_VERIFICATION,
      {
        to,
        subject: 'Verifica tu correo electrónico - Autentia',
        html: `
        <h2>Bienvenido a Autentia</h2>
        <p>Gracias por registrarte. Para activar tu cuenta, haz clic en el siguiente enlace:</p>
        <p><a href="${link}">${link}</a></p>
        <p>Este enlace expira en ${envs.VERIFICATION_TOKEN_EXPIRY_HOURS} horas.</p>
      `,
      },
      context,
    );
  }

  async sendPasswordResetEmail(
    to: string,
    token: string,
    context?: MailContext,
  ): Promise<MailSendResult> {
    const frontendUrl = envs.FRONTEND_URL || 'http://localhost:3000';
    const link = `${frontendUrl}/reset-password?token=${token}`;
    return this.send(
      MAIL_TEMPLATES.PASSWORD_RESET,
      {
        to,
        subject: 'Restablece tu contraseña - Autentia',
        html: `
        <h2>Restablecer contraseña</h2>
        <p>Has solicitado restablecer tu contraseña. Haz clic en el siguiente enlace:</p>
        <p><a href="${link}">${link}</a></p>
        <p>Este enlace expira en 1 hora.</p>
        <p>Si no solicitaste este cambio, puedes ignorar este mensaje.</p>
      `,
      },
      context,
    );
  }

  async sendPasswordResetCompletedEmail(
    to: string,
    context?: MailContext,
  ): Promise<MailSendResult> {
    return this.send(
      MAIL_TEMPLATES.PASSWORD_RESET_COMPLETED,
      {
        to,
        subject: 'Tu contraseña ha sido cambiada - Autentia',
        html: `
        <h2>Contraseña cambiada</h2>
        <p>Tu contraseña ha sido restablecida exitosamente.</p>
        <p>Si no realizaste este cambio, contacta al soporte inmediatamente.</p>
      `,
      },
      context,
    );
  }

  async sendWelcomeEmail(
    to: string,
    firstName: string,
    context?: MailContext,
  ): Promise<MailSendResult> {
    return this.send(
      MAIL_TEMPLATES.WELCOME,
      {
        to,
        subject: '¡Cuenta activada! - Autentia',
        html: `
        <h2>¡Cuenta activada!</h2>
        <p>Hola ${firstName},</p>
        <p>Tu cuenta ha sido activada exitosamente. Ya puedes iniciar sesión.</p>
      `,
      },
      context,
    );
  }

  async sendTransferRequestEmail(
    to: string,
    toFirstName: string,
    fromFirstName: string,
    vehicleName: string,
    licensePlate: string,
    context?: MailContext,
  ): Promise<MailSendResult> {
    const appUrl = envs.CORS_ORIGIN || 'http://localhost:3000';
    return this.send(
      MAIL_TEMPLATES.TRANSFER_REQUEST,
      {
        to,
        subject: 'Solicitud de transferencia de vehículo - Autentia',
        html: `
        <h2>Solicitud de Transferencia</h2>
        <p>Hola ${toFirstName},</p>
        <p><strong>${fromFirstName}</strong> te ha enviado una solicitud para transferirte el vehículo:</p>
        <p><strong>${vehicleName}</strong> (Patente: ${licensePlate})</p>
        <p>Ingresa a la aplicación para aceptar o rechazar esta solicitud.</p>
        <p><a href="${appUrl}/vehiculos/transferencias">Ir a Transferencias</a></p>
      `,
      },
      context,
    );
  }

  async sendTransferAcceptedEmail(
    to: string,
    toFirstName: string,
    newOwnerName: string,
    vehicleName: string,
    licensePlate: string,
    context?: MailContext,
  ): Promise<MailSendResult> {
    return this.send(
      MAIL_TEMPLATES.TRANSFER_ACCEPTED,
      {
        to,
        subject: 'Transferencia completada - Autentia',
        html: `
        <h2>Transferencia Completada</h2>
        <p>Hola ${toFirstName},</p>
        <p>La transferencia del vehículo <strong>${vehicleName}</strong> (Patente: ${licensePlate}) ha sido aceptada por <strong>${newOwnerName}</strong>.</p>
        <p>Ya no figuras como propietario de este vehículo en la plataforma.</p>
      `,
      },
      context,
    );
  }

  async sendTransferQrExpiredEmail(
    to: string,
    toFirstName: string,
    vehicleName: string,
    licensePlate: string,
    context?: MailContext,
  ): Promise<MailSendResult> {
    const appUrl = envs.FRONTEND_URL || 'http://localhost:3000';
    return this.send(
      MAIL_TEMPLATES.TRANSFER_QR_EXPIRED,
      {
        to,
        // D-094: copy voseo consistente con el frontend; no nombra al destinatario (D-082).
        subject: 'Tu QR de transferencia venció - Autentia',
        html: `
        <h2>Tu QR de transferencia venció</h2>
        <p>Hola ${toFirstName},</p>
        <p>Tu QR de transferencia para el vehículo <strong>${vehicleName}</strong> (patente ${licensePlate}) venció.</p>
        <p>Si todavía querés transferir el vehículo, generá uno nuevo desde el vehículo.</p>
        <p><a href="${appUrl}/vehicles">Ir a Mis Vehículos</a></p>
      `,
      },
      context,
    );
  }

  /**
   * D-117: email de invitación al dueño en el onboarding administrado de
   * concesionaria. El link apunta a la ruta pública del wizard del frontend
   * (`${FRONTEND_URL}/invitations/{token}?kind=dealership`) — el backend NO
   * expone el token en ninguna respuesta ni listener adicional.
   *
   * El query param `kind=dealership` le permite al wizard público elegir el
   * preview sin hacer probe (decisión PM: eliminar el 404 por visita).
   *
   * Marca "Autentia" (marca oficial del producto; los mails legacy también
   * usan Autentia).
   */
  async sendDealershipInvitationEmail(
    to: string,
    dealershipName: string,
    token: string,
    context?: MailContext,
  ): Promise<MailSendResult> {
    const frontendUrl = envs.FRONTEND_URL || 'http://localhost:3000';
    const link = `${frontendUrl}/invitations/${token}?kind=dealership`;
    return this.send(
      MAIL_TEMPLATES.DEALERSHIP_INVITATION,
      {
        to,
        subject: `Completá el alta de ${dealershipName} - Autentia`,
        html: `
        <h2>Completá el alta de ${dealershipName}</h2>
        <p>Te invitamos a completar el alta de la concesionaria <strong>${dealershipName}</strong> en Autentia.</p>
        <p><a href="${link}" style="display:inline-block;padding:10px 18px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:6px;">Completar el alta</a></p>
        <p>Este enlace expira en 7 días.</p>
        <p>Recibís este email porque un administrador registró <strong>${dealershipName}</strong> en Autentia.</p>
      `,
      },
      context,
    );
  }

  /**
   * Confirmación al dueño cuando la concesionaria quedó operativa
   * (wizard de onboarding completado → status active / claimed_at).
   */
  async sendDealershipClaimedEmail(
    to: string,
    dealershipName: string,
    context?: MailContext,
  ): Promise<MailSendResult> {
    return this.send(
      MAIL_TEMPLATES.DEALERSHIP_CLAIMED,
      {
        to,
        subject: `Tu concesionaria ${dealershipName} quedó activa - Autentia`,
        html: `
        <h2>¡Tu concesionaria quedó activa!</h2>
        <p>¡Buenas noticias! <strong>${dealershipName}</strong> quedó activa en Autentia.</p>
        <p>Ya podés administrar tus vehículos, invitaciones y operaciones desde el panel de la concesionaria.</p>
      `,
      },
      context,
    );
  }

  /**
   * D-117: email de invitación al dueño en el onboarding administrado de
   * taller. El link apunta a la ruta pública del wizard del frontend
   * (`${FRONTEND_URL}/invitations/{token}?kind=workshop`) — el backend NO
   * expone el token en ninguna respuesta ni listener adicional.
   *
   * El query param `kind=workshop` le permite al wizard público elegir el
   * preview sin hacer probe (decisión PM: eliminar el 404 por visita).
   *
   * Marca "Autentia" (marca oficial del producto; los mails legacy también
   * usan Autentia).
   */
  async sendWorkshopInvitationEmail(
    to: string,
    workshopName: string,
    token: string,
    context?: MailContext,
  ): Promise<MailSendResult> {
    const frontendUrl = envs.FRONTEND_URL || 'http://localhost:3000';
    const link = `${frontendUrl}/invitations/${token}?kind=workshop`;
    return this.send(
      MAIL_TEMPLATES.WORKSHOP_INVITATION,
      {
        to,
        subject: `Completá el alta de ${workshopName} - Autentia`,
        html: `
        <h2>Completá el alta de ${workshopName}</h2>
        <p>Te invitamos a completar el alta del taller <strong>${workshopName}</strong> en Autentia.</p>
        <p><a href="${link}" style="display:inline-block;padding:10px 18px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:6px;">Completar el alta</a></p>
        <p>Este enlace expira en 7 días.</p>
        <p>Recibís este email porque un administrador registró <strong>${workshopName}</strong> en Autentia.</p>
      `,
      },
      context,
    );
  }

  /**
   * Confirmación al dueño cuando el taller quedó operativo
   * (wizard de onboarding completado → status active / claimed_at).
   */
  async sendWorkshopClaimedEmail(
    to: string,
    workshopName: string,
    context?: MailContext,
  ): Promise<MailSendResult> {
    return this.send(
      MAIL_TEMPLATES.WORKSHOP_CLAIMED,
      {
        to,
        subject: `Tu taller ${workshopName} quedó activo - Autentia`,
        html: `
        <h2>¡Tu taller quedó activo!</h2>
        <p>¡Buenas noticias! <strong>${workshopName}</strong> quedó activo en Autentia.</p>
        <p>Ya podés administrar tus vehículos, invitaciones y operaciones desde el panel del taller.</p>
      `,
      },
      context,
    );
  }

  /**
   * D-117: email de invitación a un usuario de plataforma (panel admin). El
   * link apunta a la ruta pública del wizard del frontend
   * (`${FRONTEND_URL}/invitations/{token}?kind=user`) — el backend NO expone
   * el token en ninguna respuesta.
   *
   * El query param `kind=user` le permite al wizard público elegir el preview
   * sin hacer probe (mismo criterio que workshops/dealerships).
   */
  async sendUserInvitationEmail(
    to: string,
    roleName: string,
    token: string,
    context?: MailContext,
  ): Promise<MailSendResult> {
    const frontendUrl = envs.FRONTEND_URL || 'http://localhost:3000';
    const link = `${frontendUrl}/invitations/${token}?kind=user`;
    return this.send(
      MAIL_TEMPLATES.USER_INVITATION,
      {
        to,
        subject: `Te invitamos a Autentia como ${roleName} - Autentia`,
        html: `
        <h2>Te invitamos a Autentia</h2>
        <p>Te invitamos a unirte a Autentia con el rol <strong>${roleName}</strong>.</p>
        <p><a href="${link}" style="display:inline-block;padding:10px 18px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:6px;">Completar el alta</a></p>
        <p>Este enlace expira en 7 días.</p>
        <p>Recibís este email porque un administrador te invitó a la plataforma.</p>
      `,
      },
      context,
    );
  }

  /**
   * Notificación de rol asignado a una cuenta de plataforma ya existente
   * (sin wizard, porque la cuenta ya tiene credencial activa).
   */
  async sendUserRoleAssignedEmail(
    to: string,
    roleName: string,
    context?: MailContext,
  ): Promise<MailSendResult> {
    return this.send(
      MAIL_TEMPLATES.USER_ROLE_ASSIGNED,
      {
        to,
        subject: `Tu rol en Autentia es ${roleName} - Autentia`,
        html: `
        <h2>Tu rol en Autentia</h2>
        <p>Te notificamos que tu usuario ahora tiene el rol <strong>${roleName}</strong> en Autentia.</p>
        <p>Ya podés acceder a las funciones correspondientes desde tu panel.</p>
      `,
      },
      context,
    );
  }
}
