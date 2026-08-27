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
    const link = `${envs.API_URL}/auth/verify-email?token=${token}`;
    await this.send({
      to,
      subject: 'Verifica tu correo electrónico - FollowApp',
      html: `
        <h2>Bienvenido a FollowApp</h2>
        <p>Gracias por registrarte. Para activar tu cuenta, haz clic en el siguiente enlace:</p>
        <p><a href="${link}">${link}</a></p>
        <p>Este enlace expira en ${envs.VERIFICATION_TOKEN_EXPIRY_HOURS} horas.</p>
      `,
    });
  }

  async sendPasswordResetEmail(to: string, token: string): Promise<void> {
    const link = `${envs.API_URL}/auth/reset-password?token=${token}`;
    await this.send({
      to,
      subject: 'Restablece tu contraseña - FollowApp',
      html: `
        <h2>Restablecer contraseña</h2>
        <p>Has solicitado restablecer tu contraseña. Haz clic en el siguiente enlace:</p>
        <p><a href="${link}">${link}</a></p>
        <p>Este enlace expira en 1 hora.</p>
      `,
    });
  }

  async sendWelcomeEmail(to: string, firstName: string): Promise<void> {
    await this.send({
      to,
      subject: '¡Cuenta activada! - FollowApp',
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
      subject: 'Solicitud de transferencia de vehículo - FollowApp',
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
      subject: 'Transferencia completada - FollowApp',
      html: `
        <h2>Transferencia Completada</h2>
        <p>Hola ${toFirstName},</p>
        <p>La transferencia del vehículo <strong>${vehicleName}</strong> (Patente: ${licensePlate}) ha sido aceptada por <strong>${newOwnerName}</strong>.</p>
        <p>Ya no figuras como propietario de este vehículo en la plataforma.</p>
      `,
    });
  }
}
