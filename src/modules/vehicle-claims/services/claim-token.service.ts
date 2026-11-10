import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash } from 'crypto';
import { envs } from '../../../config/envs';
import { TicketExpiredException } from '../../../common/exceptions/coded.exception';

/** Vida del ticket verify → commit (D-TL-VC-14). */
export const CLAIM_TICKET_TTL_SECONDS = 1200;

/**
 * Secret derivado del JWT de sesión. NO se reutiliza `JWT_SECRET` plano: el
 * ticket del reclamo no debe compartir audiencia con los access tokens de
 * `JwtStrategy`. Tampoco se usa `JWT_REFRESH_SECRET`. Sin variable nueva.
 */
export const CLAIM_TICKET_SECRET = `${envs.JWT_SECRET}:claim-ticket`;

export interface ClaimTicketPayload {
  inviteId: string;
  vehicleId: string;
  purpose: 'claim';
}

/**
 * ClaimTokenService — hashing del token del link y firma/validación del ticket.
 *
 * S-1: el token crudo NUNCA se persiste. `hashToken` es la única forma de
 * buscar un invite (`tokenHash @unique`). Ni el token ni el hash se loguean.
 */
@Injectable()
export class ClaimTokenService {
  constructor(private readonly jwtService: JwtService) {}

  /** SHA-256 hex (64 chars) del token crudo. */
  hashToken(token: string): string {
    return createHash('sha256').update(token, 'utf8').digest('hex');
  }

  /** Ticket de 20 min con audiencia propia (`purpose: 'claim'`). */
  signTicket(inviteId: string, vehicleId: string): string {
    return this.jwtService.sign(
      { inviteId, vehicleId, purpose: 'claim' } satisfies ClaimTicketPayload,
      {
        secret: CLAIM_TICKET_SECRET,
        expiresIn: CLAIM_TICKET_TTL_SECONDS,
        algorithm: 'HS256',
      },
    );
  }

  /**
   * Verifica firma, expiración y `purpose`. Cualquier fallo (vencido, alterado,
   * de otro flujo) se traduce al mismo 401 `TICKET_EXPIRED`: el frontend vuelve
   * a verificar sin gastar intentos (T20).
   */
  verifyTicket(ticket: string): ClaimTicketPayload {
    let payload: Partial<ClaimTicketPayload> & { purpose?: string };
    try {
      payload = this.jwtService.verify<ClaimTicketPayload>(ticket, {
        secret: CLAIM_TICKET_SECRET,
        algorithms: ['HS256'],
      });
    } catch {
      throw new TicketExpiredException();
    }

    if (
      payload.purpose !== 'claim' ||
      typeof payload.inviteId !== 'string' ||
      typeof payload.vehicleId !== 'string'
    ) {
      throw new TicketExpiredException();
    }

    return {
      inviteId: payload.inviteId,
      vehicleId: payload.vehicleId,
      purpose: 'claim',
    };
  }
}
