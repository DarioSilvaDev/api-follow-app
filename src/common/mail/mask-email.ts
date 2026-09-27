/**
 * Enmascara la parte local de una dirección de email para poder usarla como
 * correlación en logs sin escribir PII.
 *
 * Se extrajo del `MailService` porque hay al menos un caso donde el listener
 * necesita enmascarar por su cuenta: el evento de invitación de usuario de
 * plataforma no transporta ningún id de dominio, así que la única correlación
 * posible es el email. Duplicar la lógica en el listener era la alternativa
 * obvia y es exactamente el tipo de duplicación que después diverge entre
 * archivos y termina escribiendo emails completos en un log.
 *
 * La parte local es la PII; el dominio se conserva porque es necesario para
 * diagnosticar un dominio inválido o un error de DKIM.
 */
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  return `${local?.slice(0, 2) ?? ''}***@${domain ?? '?'}`;
}
