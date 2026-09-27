import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { envs } from '../../config/envs';
import { maskEmail } from './mask-email';
import {
  MAIL_TEMPLATES,
  MailContext,
  MailSendResult,
  MailTemplate,
} from './mail.types';

/**
 * Códigos de error de red de nodemailer/Node que son TRANSITORIOS: reintentar
 * con el mismo payload tiene sentido porque el servidor pudo no haber
 * recibido nada, o haberlo recibido y perdido la respuesta.
 */
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
 * Códigos de respuesta SMTP que son transitorios pese a ser 4xx: el servidor
 * está aplicando throttling o está momentáneamente saturado (rate limit,
 * greylisting, buzón ocupado). La diferencia con un 550 (buzón inexistente) es
 * que un reintento posterior sí funciona.
 */
const TRANSIENT_SMTP_CODES = new Set([421, 450, 451]);

interface MailOptions {
  to: string;
  subject: string;
  html: string;
}

@Injectable()
export class MailService {
  private transporter: nodemailer.Transporter | null = null;
  private readonly logger = new Logger(MailService.name);

  constructor() {
    if (envs.SMTP_HOST && envs.SMTP_USER) {
      this.transporter = nodemailer.createTransport({
        host: envs.SMTP_HOST,
        port: envs.SMTP_PORT,
        secure: envs.SMTP_PORT === 465,
        // STARTTLS obligatorio en el puerto de submission. Sin esto, las
        // credenciales viajan en claro si el servidor no lo exige.
        requireTLS: envs.SMTP_PORT === 587,
        connectionTimeout: envs.SMTP_CONNECTION_TIMEOUT_MS,
        greetingTimeout: envs.SMTP_GREETING_TIMEOUT_MS,
        socketTimeout: envs.SMTP_SOCKET_TIMEOUT_MS,
        tls: {
          // Default SEGURO. `false` solo si el relay tiene un certificado
          // self-signed irrecuperable, y es una decisión explícita del
          // operador (SMTP_REJECT_UNAUTHORIZED), nunca un default. Sin esto,
          // un atacante en la red del relay puede leer y reescribir los
          // emails de invitación, que son la vía de onboard del owner.
          rejectUnauthorized: envs.SMTP_REJECT_UNAUTHORIZED,
        },
        auth: {
          user: envs.SMTP_USER,
          pass: envs.SMTP_PASS,
        },
      });
    } else {
      this.logger.warn('SMTP not configured. Emails will not be sent.');
    }
  }

  /** T-4: detección de degradación sin depender de un usuario quejándose. */
  isConfigured(): boolean {
    return this.transporter !== null;
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
   * resuelve (D-113). La distincion importa porque reintentar un 5xx
   * permanente convierte un error sin solucion en carga sobre el relay: tres
   * entregas a un buzon inexistente y tres esperas de backoff por cada
   * registro fallido.
   *
   * Regla canonica RFC 5321: 4xx transitorio, 5xx permanente. Se aplica la
   * regla en vez de una lista de "5xx conocidos" porque los codigos de
   * diagnostico de SMTP no son cerrados: 550 (buzon inexistente), 551 (usuario
   * no local) y 552 (almacenamiento lleno) son 5xx PERMANENTES aunque
   * parezcan un error del servidor.
   */
  private classify(error: unknown): { code: string; permanent: boolean } {
    const err = (error ?? {}) as {
      code?: string;
      responseCode?: number;
    };

    if (err.responseCode !== undefined) {
      const code = String(err.responseCode);
      const transient =
        TRANSIENT_SMTP_CODES.has(err.responseCode) ||
        (err.responseCode >= 400 && err.responseCode < 500);
      return { code, permanent: !transient };
    }

    const code = err.code ?? 'UNKNOWN';
    return { code, permanent: !TRANSIENT_NETWORK_CODES.has(code) };
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
   * regenera un token, porque un timeout de SMTP es ambiguo (el servidor pudo
   * aceptar el mensaje y perder la respuesta) y un token distinto produciría
   * un segundo email con un enlace muerto.
   */
  private async send(
    template: MailTemplate,
    options: MailOptions,
    context: MailContext = {},
  ): Promise<MailSendResult> {
    const recipient = this.mask(options.to);

    if (!this.transporter) {
      this.logger.error(
        `Mail not sent: SMTP unconfigured (template=${template}, recipient=${recipient})`,
      );
      return {
        ok: false,
        template,
        recipient,
        code: 'SMTP_NOT_CONFIGURED',
        // Un restart es lo único que lo arregla: insistir en el mismo proceso
        // no aporta nada.
        permanent: true,
        attempts: 0,
      };
    }

    const maxAttempts = envs.SMTP_RETRY_ATTEMPTS;
    let lastCode = 'UNKNOWN';

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        // El tipo de retorno de nodemailer es `any`: se estrecha a la única
        // parte que nos interesa. `messageId` es opcional en la practica
        // (depende del transporte), y por eso el tipo lo declara opcional en
        // vez de asumir que siempre viene.
        const info = (await this.transporter.sendMail({
          from: envs.SMTP_FROM,
          to: options.to,
          subject: options.subject,
          html: options.html,
        })) as { messageId?: string };

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
      } catch (error) {
        const { code, permanent } = this.classify(error);
        lastCode = code;

        if (permanent) {
          // Destinatario inexistente, credenciales rechazadas o contenido
          // rechazado: insistir no cambia el resultado (D-113).
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
          // fallan a la vez reintenten en lockstep contra un relay caído.
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
      }
    }

    // inalcanzable en la práctica: el loop siempre retorna.
    return {
      ok: false,
      template,
      recipient,
      code: lastCode,
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
   * D-106: email de invitación al dueño en el onboarding administrado de
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
   * D-106: confirmación al dueño cuando la concesionaria quedó operativa
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
   * D-106: email de invitación al dueño en el onboarding administrado de
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
   * D-106: confirmación al dueño cuando el taller quedó operativo
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
   * D-106: email de invitación a un usuario de plataforma (panel admin). El
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
   * D-106: notificación de rol asignado a una cuenta de plataforma ya existente
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
