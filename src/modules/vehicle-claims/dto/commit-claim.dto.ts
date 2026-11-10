import { IsJWT } from 'class-validator';

/**
 * Body de `POST /api/vehicle-claims/public/:token/commit`.
 *
 * El ticket viaja en el body (no en cookie) y se valida por firma. Un JWT
 * vencido pasa el formato y se rechaza con 401 `TICKET_EXPIRED` en el handler
 * (T20); un string que ni siquiera es JWT cae en la validación global.
 */
export class CommitClaimDto {
  @IsJWT()
  ticket!: string;
}
