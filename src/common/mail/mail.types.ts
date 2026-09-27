/**
 * Contrato de la frontera de error del envío de email.
 *
 * D-109 (PM): un email fallido NUNCA revierte la acción de negocio. Para que
 * eso sea un invariante estructural y no una convención que cada handler
 * recuerda, `MailService.send()` es la única frontera de error de email y
 * NUNCA lanza: siempre devuelve un resultado tipado. Si el servicio de correo
 * no puede lanzar, ningún comando puede responder 503/5xx por email.
 *
 * Consecuencia directa: los listeners no necesitan try/catch para el SMTP
 * (sí lo necesitan para sus propias lecturas Prisma, que son otro dominio).
 */

/**
 * Identificadores estables de plantilla. Se loguean en lugar del `subject` o
 * del `html` para que los logs sean grepeables y no contengan datos de
 * negocio (nombres de dealership, roles,etc.).
 */
export const MAIL_TEMPLATES = {
  EMAIL_VERIFICATION: 'email_verification',
  PASSWORD_RESET: 'password_reset',
  PASSWORD_RESET_COMPLETED: 'password_reset_completed',
  WELCOME: 'welcome',
  TRANSFER_REQUEST: 'transfer_request',
  TRANSFER_ACCEPTED: 'transfer_accepted',
  TRANSFER_QR_EXPIRED: 'transfer_qr_expired',
  DEALERSHIP_INVITATION: 'dealership_invitation',
  DEALERSHIP_CLAIMED: 'dealership_claimed',
  WORKSHOP_INVITATION: 'workshop_invitation',
  WORKSHOP_CLAIMED: 'workshop_claimed',
  USER_INVITATION: 'user_invitation',
  USER_ROLE_ASSIGNED: 'user_role_assigned',
} as const;

export type MailTemplate = (typeof MAIL_TEMPLATES)[keyof typeof MAIL_TEMPLATES];

/**
 * Resultado de un envío aceptado por el handshake SMTP.
 *
 * D-115 (PM): `messageId` significa "aceptado por el proveedor", NUNCA
 * "entregado". Sin DSN ni webhook de bounce no se puede afirmar entrega, así
 * que el tipo no modela ese estado para no inducir a leerlo.
 */
export type MailSendResult =
  | {
      ok: true;
      template: MailTemplate;
      /** Destinatario enmascarado. El email en claro nunca sale del servicio. */
      recipient: string;
      /**
       * Opcional a propósito: nodemailer solo lo garantiza cuando el
       * transporte lo reporta, y un `string` inventado para cumplir el
       * tipo sería peor que `undefined`. Sirve para trazar el mensaje en el
       * panel del proveedor, no para decidir el estado del envío.
       */
      messageId?: string;
      /** Intentos consumidos, incluido el exitoso. 1 = salió al primer intento. */
      attempts: number;
    }
  | {
      ok: false;
      template: MailTemplate;
      recipient: string;
      /** Código de error estable de nodemailer/red (`ETIMEDOUT`, `EAUTH`, `EENVELOPE`...) o el código de respuesta SMTP. */
      code: string;
      /**
       * `true` = reintentar no tiene solución por insistencia (destinatario
       * inexistente, credenciales rechazadas, contenido rechazado). `false` =
       * transitorio, agotados los reintentos (D-113: siempre con el mismo
       * token y el mismo payload).
       */
      permanent: boolean;
      attempts: number;
    };

/** Campos de correlación opcionales. Nunca incluyen el token de ningún tipo. */
export interface MailContext {
  userId?: string;
  workshopId?: string;
  dealershipId?: string;
  invitationId?: string;
  vehicleId?: string;
}
