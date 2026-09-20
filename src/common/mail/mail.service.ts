import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { envs } from '../../config/envs';

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
        auth: {
          user: envs.SMTP_USER,
          pass: envs.SMTP_PASS,
        },
      });
    } else {
      this.logger.warn('SMTP not configured. Emails will be logged.');
    }
  }

  private async send(options: {
    to: string;
    subject: string;
    html: string;
  }): Promise<void> {
    if (!this.transporter) {
      this.logger.log(
        `[EMAIL] To: ${options.to} | Subject: ${options.subject}`,
      );
      return;
    }
    await this.transporter.sendMail({
      from: envs.SMTP_FROM,
      ...options,
    });
  }

  async sendVerificationEmail(to: string, token: string): Promise<void> {
    // D-034: the verification link points to the frontend page (which consumes
    // GET /auth/verify-email), consistent with D-028 for password reset.
    const frontendUrl = envs.FRONTEND_URL || 'http://localhost:3000';
    const link = `${frontendUrl}/verify-email?token=${token}`;
    await this.send({
      to,
      subject: 'Verifica tu correo electrónico - Autentia',
      html: `
        <h2>Bienvenido a Autentia</h2>
        <p>Gracias por registrarte. Para activar tu cuenta, haz clic en el siguiente enlace:</p>
        <p><a href="${link}">${link}</a></p>
        <p>Este enlace expira en ${envs.VERIFICATION_TOKEN_EXPIRY_HOURS} horas.</p>
      `,
    });
  }

  async sendPasswordResetEmail(to: string, token: string): Promise<void> {
    const frontendUrl = envs.FRONTEND_URL || 'http://localhost:3000';
    const link = `${frontendUrl}/reset-password?token=${token}`;
    await this.send({
      to,
      subject: 'Restablece tu contraseña - Autentia',
      html: `
        <h2>Restablecer contraseña</h2>
        <p>Has solicitado restablecer tu contraseña. Haz clic en el siguiente enlace:</p>
        <p><a href="${link}">${link}</a></p>
        <p>Este enlace expira en 1 hora.</p>
        <p>Si no solicitaste este cambio, puedes ignorar este mensaje.</p>
      `,
    });
  }

  async sendPasswordResetCompletedEmail(to: string): Promise<void> {
    await this.send({
      to,
      subject: 'Tu contraseña ha sido cambiada - Autentia',
      html: `
        <h2>Contraseña cambiada</h2>
        <p>Tu contraseña ha sido restablecida exitosamente.</p>
        <p>Si no realizaste este cambio, contacta al soporte inmediatamente.</p>
      `,
    });
  }

  async sendWelcomeEmail(to: string, firstName: string): Promise<void> {
    await this.send({
      to,
      subject: '¡Cuenta activada! - Autentia',
      html: `
        <h2>¡Cuenta activada!</h2>
        <p>Hola ${firstName},</p>
        <p>Tu cuenta ha sido activada exitosamente. Ya puedes iniciar sesión.</p>
      `,
    });
  }

  async sendTransferRequestEmail(
    to: string,
    toFirstName: string,
    fromFirstName: string,
    vehicleName: string,
    licensePlate: string,
  ): Promise<void> {
    const appUrl = envs.CORS_ORIGIN || 'http://localhost:3000';
    await this.send({
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
    });
  }

  async sendTransferAcceptedEmail(
    to: string,
    toFirstName: string,
    newOwnerName: string,
    vehicleName: string,
    licensePlate: string,
  ): Promise<void> {
    await this.send({
      to,
      subject: 'Transferencia completada - Autentia',
      html: `
        <h2>Transferencia Completada</h2>
        <p>Hola ${toFirstName},</p>
        <p>La transferencia del vehículo <strong>${vehicleName}</strong> (Patente: ${licensePlate}) ha sido aceptada por <strong>${newOwnerName}</strong>.</p>
        <p>Ya no figuras como propietario de este vehículo en la plataforma.</p>
      `,
    });
  }

  async sendTransferQrExpiredEmail(
    to: string,
    toFirstName: string,
    vehicleName: string,
    licensePlate: string,
  ): Promise<void> {
    const appUrl = envs.FRONTEND_URL || 'http://localhost:3000';
    await this.send({
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
    });
  }

  /**
   * D-106: email de invitación al dueño en el onboarding administrado de
   * concesionaria. El link apunta a la ruta pública del wizard del frontend
   * (`${FRONTEND_URL}/invitations/{token}`) — el backend NO expone el token
   * en ninguna respuesta ni listener adicional.
   *
   * Marca "Autentia" (marca oficial del producto; los mails legacy también
   * usan Autentia).
   */
  async sendDealershipInvitationEmail(
    to: string,
    dealershipName: string,
    token: string,
  ): Promise<void> {
    const frontendUrl = envs.FRONTEND_URL || 'http://localhost:3000';
    const link = `${frontendUrl}/invitations/${token}`;
    await this.send({
      to,
      subject: `Completá el alta de ${dealershipName} - Autentia`,
      html: `
        <h2>Completá el alta de ${dealershipName}</h2>
        <p>Te invitamos a completar el alta de la concesionaria <strong>${dealershipName}</strong> en Autentia.</p>
        <p><a href="${link}" style="display:inline-block;padding:10px 18px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:6px;">Completar el alta</a></p>
        <p>Este enlace expira en 7 días.</p>
        <p>Recibís este email porque un administrador registró <strong>${dealershipName}</strong> en Autentia.</p>
      `,
    });
  }

  /**
   * D-106: confirmación al dueño cuando la concesionaria quedó operativa
   * (wizard de onboarding completado → status active / claimed_at).
   */
  async sendDealershipClaimedEmail(
    to: string,
    dealershipName: string,
  ): Promise<void> {
    await this.send({
      to,
      subject: `Tu concesionaria ${dealershipName} quedó activa - Autentia`,
      html: `
        <h2>¡Tu concesionaria quedó activa!</h2>
        <p>¡Buenas noticias! <strong>${dealershipName}</strong> quedó activa en Autentia.</p>
        <p>Ya podés administrar tus vehículos, invitaciones y operaciones desde el panel de la concesionaria.</p>
      `,
    });
  }
}
