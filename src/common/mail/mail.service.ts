import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Resend } from 'resend';
import type { CreateEmailRequestOptions } from 'resend';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
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

/** C-4: variantes del aviso al taller sobre el estado de un reclamo. */
export type VehicleClaimWorkshopNotificationVariant =
  'claimed' | 'verify_failed' | 'blocked' | 'manual_review' | 'auto_revoked';

/** C-4: datos dinámicos del aviso al taller. */
export interface VehicleClaimWorkshopNotificationParams {
  vehicleId: string;
  licensePlate: string;
  careEpisodeId?: string | null;
  claimantName?: string | null;
  claimantEmail?: string | null;
  failedAttempts?: number;
  alreadyOwner?: boolean;
}

@Injectable()
export class MailService {
  private resendClient: Resend | null = null;
  // `Transporter` sin parámetro de tipo equivale a `Transporter<any>`, lo que
  // convierte `sendMail()` en `any` y propaga el `any` hasta `info.messageId`.
  // El transporter SMTP siempre resuelve con `SMTPTransport.SentMessageInfo`.
  private nodemailerTransporter: Transporter<SMTPTransport.SentMessageInfo> | null =
    null;
  private readonly logger = new Logger(MailService.name);
  private readonly provider: 'resend' | 'nodemailer' | 'mock';

  constructor() {
    this.provider =
      envs.MAIL_PROVIDER || (envs.RESEND_API_KEY ? 'resend' : 'mock');

    if (this.provider === 'resend') {
      if (envs.RESEND_API_KEY) {
        this.resendClient = new Resend(envs.RESEND_API_KEY);
      } else {
        this.logger.warn(
          'RESEND_API_KEY not configured. Emails will not be sent.',
        );
      }
    } else if (this.provider === 'nodemailer') {
      try {
        const port = envs.SMTP_PORT || 587;
        const secure =
          envs.SMTP_SECURE !== undefined ? envs.SMTP_SECURE : port === 465;
        this.nodemailerTransporter = nodemailer.createTransport({
          host: envs.SMTP_HOST,
          port,
          secure,
          auth:
            envs.SMTP_USER && envs.SMTP_PASS
              ? {
                  user: envs.SMTP_USER,
                  pass: envs.SMTP_PASS,
                }
              : undefined,
        });
      } catch (error) {
        this.logger.error(
          'Failed to create nodemailer transporter',
          error as Error,
        );
        this.nodemailerTransporter = null;
      }
    } else {
      this.logger.warn('Mail provider set to mock. Emails will not be sent.');
    }
  }

  /** T-4: detección de degradación sin depender de un usuario quejándose. */
  isConfigured(): boolean {
    if (this.provider === 'resend') {
      return this.resendClient !== null;
    }
    if (this.provider === 'nodemailer') {
      return this.nodemailerTransporter !== null;
    }
    return false;
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

    if (this.provider === 'mock') {
      this.logger.warn(
        `Mail not sent (mock provider) (template=${template}, recipient=${recipient})`,
      );
      return {
        ok: false,
        template,
        recipient,
        code: 'MAIL_MOCK_PROVIDER',
        permanent: true,
        attempts: 0,
      };
    }

    if (this.provider === 'resend' && !this.resendClient) {
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

    if (this.provider === 'nodemailer' && !this.nodemailerTransporter) {
      this.logger.error(
        `Mail not sent: provider unconfigured (template=${template}, recipient=${recipient})`,
      );
      return {
        ok: false,
        template,
        recipient,
        code: 'NODEMAILER_NOT_CONFIGURED',
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
        if (this.provider === 'resend' && this.resendClient) {
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
        } else if (
          this.provider === 'nodemailer' &&
          this.nodemailerTransporter
        ) {
          const info = await Promise.race([
            this.nodemailerTransporter.sendMail({
              from: envs.SMTP_FROM,
              to: options.to,
              subject: options.subject,
              html: options.html,
            }),
            // `Promise<never>` evita que el rechazo del timeout ensanche el
            // resultado de `race` a `unknown` y mantiene el tipo del envío.
            new Promise<never>((_, reject) => {
              controller.signal.addEventListener('abort', () => {
                reject(new Error('MAIL_TIMEOUT'));
              });
            }),
          ]);

          this.logger.log(
            `Mail accepted (template=${template}, recipient=${recipient}, attempts=${attempt}, ${this.correlation(context)})`,
          );
          return {
            ok: true,
            template,
            recipient,
            messageId: info.messageId,
            attempts: attempt,
          };
        } else {
          throw new Error('MAIL_PROVIDER_UNSUPPORTED');
        }
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
    if (context.inviteId) parts.push(`inviteId=${context.inviteId}`);
    return parts.length > 0 ? parts.join(', ') : 'no-context';
  }

  /** C-4: escapa un valor dinámico antes de interpolarlo en el HTML. */
  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /** C-4: neutraliza CR/LF para que un valor dinámico no inyecte headers. */
  private headerSafe(value: string): string {
    return value.replace(/[\r\n]+/g, ' ').trim();
  }

  /** C-4: URL del panel del taller para el vehículo/atención del reclamo. */
  private vehicleClaimPanelUrl(
    vehicleId: string,
    careEpisodeId?: string | null,
  ): string {
    const base = (envs.FRONTEND_URL || 'http://localhost:3000').replace(
      /\/+$/,
      '',
    );
    return careEpisodeId
      ? `${base}/vehicles/${vehicleId}/servicios/${careEpisodeId}`
      : `${base}/vehicles/${vehicleId}`;
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
   * D-TL-5: variante combinada del email de invitación para el alta conjunta
   * (concesionaria + taller de servicio propio). Mismo link del wizard
   * (`kind=dealership`, D-TL-3: el taller viaja junto a la concesionaria vía
   * `Workshop.dealershipId`, no tiene invitación propia). Copy §13.B del spec.
   *
   * Siempre vía `send()` para heredar retry/idempotencia (D-113). El token
   * NUNCA se loguea; la correlación usa ambos ids (dealership + workshop).
   */
  async sendDealershipGroupInvitationEmail(
    to: string,
    dealershipName: string,
    workshopName: string,
    token: string,
    context?: MailContext,
  ): Promise<MailSendResult> {
    const frontendUrl = envs.FRONTEND_URL || 'http://localhost:3000';
    const link = `${frontendUrl}/invitations/${token}?kind=dealership`;
    return this.send(
      MAIL_TEMPLATES.DEALERSHIP_GROUP_INVITATION,
      {
        to,
        subject: `Completá el alta de ${dealershipName} y su taller - Autentia`,
        html: `
        <h2>Completá el alta de ${dealershipName}</h2>
        <p>Te invitamos a completar el alta de la concesionaria <strong>${dealershipName}</strong> y de su taller de servicio <strong>${workshopName}</strong> en Autentia.</p>
        <p>Al completarla, vas a poder administrar tus vehículos desde la concesionaria y registrar los services desde tu taller.</p>
        <p><a href="${link}" style="display:inline-block;padding:10px 18px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:6px;">Completar el alta</a></p>
        <p>Este enlace expira en 7 días.</p>
      `,
      },
      context,
    );
  }

  /**
   * D-TL-5: variante combinada de la confirmación para el alta conjunta.
   * Copy §13.D del spec (2 CTAs: concesionaria + taller). Las rutas de los
   * paneles son placeholders a confirmar con el frontend (ver Tech Lead
   * Attention) — no existe ruta documentada en este repo.
   */
  async sendDealershipGroupClaimedEmail(
    to: string,
    dealershipName: string,
    workshopName: string,
    context?: MailContext,
  ): Promise<MailSendResult> {
    const frontendUrl = envs.FRONTEND_URL || 'http://localhost:3000';
    return this.send(
      MAIL_TEMPLATES.DEALERSHIP_GROUP_CLAIMED,
      {
        to,
        subject: `${dealershipName} y su taller quedaron activos - Autentia`,
        html: `
        <h2>¡Tu concesionaria y tu taller quedaron activos!</h2>
        <p>Ya podés administrar <strong>${dealershipName}</strong> desde el panel de la concesionaria.</p>
        <p>Desde tu taller <strong>${workshopName}</strong>, vos y tus mecánicos pueden registrar los services para que queden en el historial de cada vehículo.</p>
        <p><a href="${frontendUrl}/panels/dealership" style="display:inline-block;padding:10px 18px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:6px;">Ir a mi concesionaria</a>&nbsp;<a href="${frontendUrl}/panels/workshop" style="display:inline-block;padding:10px 18px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:6px;">Ir a mi taller</a></p>
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

  /**
   * C-4: aviso al taller sobre el estado de un reclamo (copy §3.2). El mail
   * NUNCA transporta el link de reclamo ni el token (F-11 abierta): el CTA
   * apunta al panel del taller. Si `Workshop.email` no existe, el listener no
   * llama a este método.
   */
  async sendVehicleClaimWorkshopNotificationEmail(
    to: string,
    variant: VehicleClaimWorkshopNotificationVariant,
    params: VehicleClaimWorkshopNotificationParams,
    context?: MailContext,
  ): Promise<MailSendResult> {
    const plate = this.escapeHtml(params.licensePlate);
    const plateHeader = this.headerSafe(params.licensePlate);
    const panelUrl = this.vehicleClaimPanelUrl(
      params.vehicleId,
      params.careEpisodeId,
    );

    const rawName = params.claimantName?.trim();
    const name = this.escapeHtml(rawName || 'Alguien');
    const email = params.claimantEmail?.trim();
    const emailSuffix = email ? ` (${this.escapeHtml(email)})` : '';

    let subject = '';
    let title = '';
    const paragraphs: string[] = [];
    let cta: { label: string; url: string } | null = null;

    switch (variant) {
      case 'claimed': {
        // Sin reclamante identificable no se afirma la titularidad (decisión PM
        // sobre el fallback): el aviso al taller se manda igual porque es la
        // mitigación anti-squatting #1, pero el copy no inventa un vínculo.
        subject = rawName
          ? `${this.headerSafe(rawName)} reclamó el vehículo ${plateHeader} - Autentia`
          : `Alguien reclamó el vehículo ${plateHeader} - Autentia`;
        title = 'Reclamo completado';
        paragraphs.push(
          rawName
            ? `${name}${emailSuffix} reclamó el vehículo ${plate} y el historial ya quedó a su nombre.`
            : `Alguien reclamó el vehículo ${plate}.`,
        );
        paragraphs.push(
          params.alreadyOwner
            ? 'No necesitás hacer nada.'
            : 'No necesitás hacer nada. Si el reclamo no corresponde, podés revocarlo desde el panel.',
        );
        cta = { label: 'Ver el reclamo', url: panelUrl };
        break;
      }
      case 'verify_failed': {
        subject = `Intento fallido de reclamo en ${plateHeader} - Autentia`;
        title = 'Intento fallido de reclamo';
        paragraphs.push(
          params.failedAttempts !== undefined
            ? `Intento ${params.failedAttempts} de verificación fallido para el vehículo ${plate}.`
            : `Registramos un intento fallido de reclamo para el vehículo ${plate}.`,
        );
        paragraphs.push(
          'Si no reconocés este movimiento, revisá con quién compartiste el link.',
        );
        cta = { label: 'Ver el reclamo', url: panelUrl };
        break;
      }
      case 'blocked': {
        subject = `Reclamo bloqueado: ${plateHeader} ya tiene titular - Autentia`;
        title = 'Reclamo bloqueado';
        paragraphs.push(
          `Alguien intentó reclamar el vehículo ${plate}, pero ya tiene un titular registrado.`,
        );
        paragraphs.push('No se creó ningún vínculo nuevo.');
        break;
      }
      case 'manual_review': {
        subject = `Reclamo a revisar: ${plateHeader} - Autentia`;
        title = 'Reclamo a revisar';
        paragraphs.push(
          rawName
            ? `${name}${emailSuffix} reclamó el vehículo ${plate}, pero no pudimos verificarlo automáticamente.`
            : `Alguien reclamó el vehículo ${plate}, pero no pudimos verificarlo automáticamente.`,
        );
        paragraphs.push(
          'Revisá el reclamo en el panel y aprobalo o rechazalo.',
        );
        cta = { label: 'Revisar el reclamo', url: panelUrl };
        break;
      }
      case 'auto_revoked': {
        subject = `El link de reclamo de ${plateHeader} fue revocado - Autentia`;
        title = 'Link de reclamo revocado';
        paragraphs.push(
          `El link de reclamo del vehículo ${plate} se revocó automáticamente después de 3 bloqueos de verificación.`,
        );
        paragraphs.push(
          'Si el dueño todavía necesita reclamar, generá un link nuevo y entregalo en persona.',
        );
        cta = { label: 'Generar link nuevo', url: panelUrl };
        break;
      }
      default:
        break;
    }

    return this.send(
      MAIL_TEMPLATES.VEHICLE_CLAIM_WORKSHOP_NOTIFICATION,
      {
        to,
        subject,
        html: `
        <h2>${title}</h2>
        ${paragraphs.map((p) => `<p>${p}</p>`).join('\n        ')}
        ${
          cta
            ? `<p><a href="${cta.url}" style="display:inline-block;padding:10px 18px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:6px;">${cta.label}</a></p>`
            : ''
        }
      `,
      },
      context,
    );
  }

  /**
   * C-4: aviso al titular activo de un intento de reclamo bloqueado (copy
   * §3.3). Prohibido mencionar el taller, al reclamante o cómo se filtró el
   * link: este método no recibe ninguno de esos datos.
   */
  async sendVehicleClaimBlockedOwnerEmail(
    to: string,
    firstName: string,
    licensePlate: string,
    context?: MailContext,
  ): Promise<MailSendResult> {
    const plate = this.escapeHtml(licensePlate);
    const plateHeader = this.headerSafe(licensePlate);
    const rawName = firstName?.trim();
    const greeting = rawName ? `Hola ${this.escapeHtml(rawName)},` : 'Hola,';
    const base = (envs.FRONTEND_URL || 'http://localhost:3000').replace(
      /\/+$/,
      '',
    );
    return this.send(
      MAIL_TEMPLATES.VEHICLE_CLAIM_BLOCKED_OWNER,
      {
        to,
        subject: `Alguien intentó reclamar tu vehículo ${plateHeader} - Autentia`,
        html: `
        <h2>Alguien intentó reclamar tu vehículo</h2>
        <p>${greeting}</p>
        <p>Registramos un intento de reclamo para el vehículo ${plate}, que figura a tu nombre en Autentia.</p>
        <p>El reclamo no se completó y el vehículo sigue siendo tuyo.</p>
        <p>Si no reconocés este movimiento, contactá a soporte.</p>
        <p><a href="${base}/vehicles" style="display:inline-block;padding:10px 18px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:6px;">Ver mi vehículo</a></p>
      `,
      },
      context,
    );
  }

  /**
   * C-4: resultado del reclamo al reclamante (copy §3.4). `revoked` y
   * `review_rejected` no llevan CTA. Todas las variantes delegan en `send()`
   * para heredar retry/idempotencia.
   *
   * `review_rejected` (rechazo de revisión manual) no puede decir "ya no figura
   * a tu nombre": nunca hubo ownership. Reutiliza el mismo template (§3.4.c).
   */
  async sendVehicleClaimResultEmail(
    to: string,
    firstName: string,
    licensePlate: string,
    outcome: 'claimed' | 'revoked' | 'review_rejected',
    context?: MailContext,
  ): Promise<MailSendResult> {
    const plate = this.escapeHtml(licensePlate);
    const plateHeader = this.headerSafe(licensePlate);
    const rawName = firstName?.trim();
    const greeting = rawName ? `Hola ${this.escapeHtml(rawName)},` : 'Hola,';
    const base = (envs.FRONTEND_URL || 'http://localhost:3000').replace(
      /\/+$/,
      '',
    );

    if (outcome === 'claimed') {
      return this.send(
        MAIL_TEMPLATES.VEHICLE_CLAIM_RESULT,
        {
          to,
          subject: `Reclamaste el vehículo ${plateHeader} - Autentia`,
          html: `
        <h2>El vehículo ya está a tu nombre</h2>
        <p>${greeting}</p>
        <p>Reclamaste el historial del vehículo ${plate}. Ya podés consultar todas sus atenciones desde Autentia.</p>
        <p><a href="${base}/vehicles" style="display:inline-block;padding:10px 18px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:6px;">Ver el historial</a></p>
      `,
        },
        context,
      );
    }

    if (outcome === 'review_rejected') {
      return this.send(
        MAIL_TEMPLATES.VEHICLE_CLAIM_RESULT,
        {
          to,
          subject: `El reclamo de ${plateHeader} fue rechazado - Autentia`,
          html: `
        <h2>El reclamo fue rechazado</h2>
        <p>${greeting}</p>
        <p>El taller revisó el reclamo del vehículo ${plate} y lo rechazó. El historial no quedó a tu nombre.</p>
        <p>Si creés que es un error, contactá al taller donde hiciste la última atención.</p>
      `,
        },
        context,
      );
    }

    return this.send(
      MAIL_TEMPLATES.VEHICLE_CLAIM_RESULT,
      {
        to,
        subject: `El reclamo de ${plateHeader} fue revocado - Autentia`,
        html: `
        <h2>El reclamo fue revocado</h2>
        <p>${greeting}</p>
        <p>El taller revocó el reclamo del vehículo ${plate}. El historial ya no figura a tu nombre.</p>
        <p>Si creés que es un error, contactá al taller donde hiciste la última atención.</p>
      `,
      },
      context,
    );
  }
}
