import { JwtService } from '@nestjs/jwt';
import { createHash } from 'crypto';
import { TicketExpiredException } from '../../../common/exceptions/coded.exception';
import {
  CLAIM_TICKET_SECRET,
  CLAIM_TICKET_TTL_SECONDS,
  ClaimTokenService,
} from './claim-token.service';

describe('ClaimTokenService — hash S-1 y ticket F-10', () => {
  const jwt = new JwtService({});
  const service = new ClaimTokenService(jwt);
  const inviteId = '11111111-1111-1111-1111-111111111111';
  const vehicleId = '22222222-2222-2222-2222-222222222222';

  it('hashea con SHA-256 hex determinista (nunca guarda el token crudo)', () => {
    const token = 'a'.repeat(64);
    expect(service.hashToken(token)).toBe(
      createHash('sha256').update(token, 'utf8').digest('hex'),
    );
    expect(service.hashToken(token)).toHaveLength(64);
    expect(service.hashToken(token)).not.toBe(token);
  });

  it('firma un ticket de 20 min con audiencia propia', () => {
    const ticket = service.signTicket(inviteId, vehicleId);
    const decoded = jwt.verify<{
      inviteId: string;
      vehicleId: string;
      purpose: string;
      exp: number;
      iat: number;
    }>(ticket, { secret: CLAIM_TICKET_SECRET });

    expect(decoded.inviteId).toBe(inviteId);
    expect(decoded.vehicleId).toBe(vehicleId);
    expect(decoded.purpose).toBe('claim');
    expect(decoded.exp - decoded.iat).toBe(CLAIM_TICKET_TTL_SECONDS);
    expect(CLAIM_TICKET_TTL_SECONDS).toBe(1200);
  });

  it('verifica un ticket legítimo', () => {
    const ticket = service.signTicket(inviteId, vehicleId);
    expect(service.verifyTicket(ticket)).toEqual({
      inviteId,
      vehicleId,
      purpose: 'claim',
    });
  });

  it('rechaza un ticket vencido con TICKET_EXPIRED', () => {
    const expired = jwt.sign(
      { inviteId, vehicleId, purpose: 'claim' },
      { secret: CLAIM_TICKET_SECRET, expiresIn: -1, algorithm: 'HS256' },
    );
    expect(() => service.verifyTicket(expired)).toThrow(TicketExpiredException);
  });

  it('rechaza un ticket firmado con otro secret', () => {
    const foreign = jwt.sign(
      { inviteId, vehicleId, purpose: 'claim' },
      { secret: 'otro-secret', expiresIn: 1200, algorithm: 'HS256' },
    );
    expect(() => service.verifyTicket(foreign)).toThrow(TicketExpiredException);
  });

  it('rechaza un ticket de otro flujo (purpose distinto)', () => {
    const foreign = jwt.sign(
      { inviteId, vehicleId, purpose: 'access' },
      { secret: CLAIM_TICKET_SECRET, expiresIn: 1200, algorithm: 'HS256' },
    );
    expect(() => service.verifyTicket(foreign)).toThrow(TicketExpiredException);
  });

  it('rechaza un payload incompleto', () => {
    const incomplete = jwt.sign(
      { purpose: 'claim' },
      { secret: CLAIM_TICKET_SECRET, expiresIn: 1200, algorithm: 'HS256' },
    );
    expect(() => service.verifyTicket(incomplete)).toThrow(
      TicketExpiredException,
    );
  });

  it('el 401 de ticket lleva el código estable TICKET_EXPIRED', () => {
    let error: unknown;
    try {
      service.verifyTicket('no-es-un-jwt');
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(TicketExpiredException);
    expect((error as TicketExpiredException).getResponse()).toMatchObject({
      statusCode: 401,
      code: 'TICKET_EXPIRED',
    });
  });
});
