import 'reflect-metadata';
import { Request } from 'express';
import { CommitClaimCommand } from '../commands/commit-claim/commit-claim.command';
import { VerifyClaimCommand } from '../commands/verify-claim/verify-claim.command';
import { CommitClaimDto } from '../dto/commit-claim.dto';
import { VerifyClaimDto } from '../dto/verify-claim.dto';
import { GetPublicClaimHandler } from '../queries/get-public-claim/get-public-claim.handler';
import { ClaimInviteSnapshot } from '../services/claim-state.service';
import { VehicleClaimPublicController } from './vehicle-claim-public.controller';

describe('VehicleClaimPublicController — throttle y resolución de sesión', () => {
  let controller: VehicleClaimPublicController;
  let prisma: { vehicleClaimInvite: { updateMany: jest.Mock } };
  let state: { loadByToken: jest.Mock };
  let getChallenge: { execute: jest.Mock };
  let verify: { execute: jest.Mock };
  let commit: { execute: jest.Mock };
  let jwtService: { verify: jest.Mock };

  const inviteId = '11111111-1111-1111-1111-111111111111';
  const vehicleId = '22222222-2222-2222-2222-222222222222';

  function invite(
    overrides: Partial<ClaimInviteSnapshot> = {},
  ): ClaimInviteSnapshot {
    return {
      id: inviteId,
      vehicleId,
      workshopId: '33333333-3333-3333-3333-333333333333',
      careEpisodeId: 'episode-1',
      status: 'pending',
      expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
      openedAt: null,
      verifiedAt: null,
      failedAttempts: 0,
      lastFailedAt: null,
      verificationLockedAt: null,
      lockoutCount: 0,
      usedAt: null,
      claimantUserId: null,
      vehicle: {
        id: vehicleId,
        licensePlate: 'AB123CD',
        vin: '8AJHA9CD0P1234567',
        deletedAt: null,
      },
      mileageIn: 45_000,
      ...overrides,
    };
  }

  beforeEach(() => {
    prisma = {
      vehicleClaimInvite: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    state = { loadByToken: jest.fn() };
    getChallenge = { execute: jest.fn().mockResolvedValue({ data: {} }) };
    verify = { execute: jest.fn().mockResolvedValue({ data: {} }) };
    commit = { execute: jest.fn().mockResolvedValue({ data: {} }) };
    jwtService = { verify: jest.fn() };

    controller = new VehicleClaimPublicController(
      new GetPublicClaimHandler(prisma as never, state as never),
      getChallenge as never,
      verify as never,
      commit as never,
      jwtService as never,
    );
  });

  describe('AC-3: bootstrap sin datos del vehículo', () => {
    it('devuelve EXACTAMENTE status y canVerify (falla si se agrega un campo)', async () => {
      state.loadByToken.mockResolvedValue(invite());

      const result = await controller.getPublic('token');

      expect(Object.keys(result.data).sort()).toEqual(['canVerify', 'status']);
      expect(result.data).toEqual({
        status: 'verification_required',
        canVerify: true,
      });

      const serialized = JSON.stringify(result);
      for (const forbidden of [
        'licensePlate',
        'vehicle',
        'workshop',
        'mileage',
        'brand',
        'model',
        'phone',
        'vin',
        'owner',
      ]) {
        expect(serialized).not.toContain(forbidden);
      }
    });
  });

  describe('throttle explícito por ruta (D-TL-C1)', () => {
    function throttleOf(method: keyof VehicleClaimPublicController) {
      const fn = VehicleClaimPublicController.prototype[method] as object;
      return {
        default: {
          limit: Reflect.getMetadata('THROTTLER:LIMITdefault', fn) as number,
          ttl: Reflect.getMetadata('THROTTLER:TTLdefault', fn) as number,
        },
        vehicleClaimToken: {
          limit: Reflect.getMetadata(
            'THROTTLER:LIMITvehicleClaimToken',
            fn,
          ) as number,
          ttl: Reflect.getMetadata(
            'THROTTLER:TTLvehicleClaimToken',
            fn,
          ) as number,
        },
      };
    }

    it('bootstrap: 10/60s en default y en el bucket por token', () => {
      expect(throttleOf('getPublic')).toEqual({
        default: { limit: 10, ttl: 60_000 },
        vehicleClaimToken: { limit: 10, ttl: 60_000 },
      });
    });

    it('challenge: 10/60s global y 5/300s por token', () => {
      expect(throttleOf('challenge')).toEqual({
        default: { limit: 10, ttl: 60_000 },
        vehicleClaimToken: { limit: 5, ttl: 300_000 },
      });
    });

    it.each(['verify', 'commit'] as const)(
      '%s: 5/300s en ambos buckets',
      (method) => {
        expect(throttleOf(method)).toEqual({
          default: { limit: 5, ttl: 300_000 },
          vehicleClaimToken: { limit: 5, ttl: 300_000 },
        });
      },
    );
  });

  describe('delegación y saneamiento de entrada', () => {
    it('challenge delega token y licensePlate', async () => {
      await controller.challenge('token', 'AB123CD');

      expect(getChallenge.execute).toHaveBeenCalledWith('token', 'AB123CD');
    });

    it('verify trunca la IP y limita el user-agent antes de persistirlos', async () => {
      const dto: VerifyClaimDto = { licensePlate: 'AB123CD' };
      const req = {
        ip: '::ffff:192.168.1.55',
        headers: { 'user-agent': 'a'.repeat(400) },
        cookies: {},
      } as unknown as Request;

      await controller.verify('token', dto, req);

      const command = verify.execute.mock.calls[0][0] as VerifyClaimCommand;
      expect(command).toBeInstanceOf(VerifyClaimCommand);
      expect(command.token).toBe('token');
      expect(command.dto).toBe(dto);
      expect(command.ip).toBe('192.168.1.0');
      expect(command.userAgent).toHaveLength(300);
    });

    it('verify deja userAgent en null si el header no es string', async () => {
      const req = {
        ip: '203.0.113.9',
        headers: {},
        cookies: {},
      } as unknown as Request;

      await controller.verify('token', { licensePlate: 'AB123CD' }, req);

      const command = verify.execute.mock.calls[0][0] as VerifyClaimCommand;
      expect(command.ip).toBe('203.0.113.0');
      expect(command.userAgent).toBeNull();
    });

    it('commit resuelve la sesión del cookie access_token', async () => {
      jwtService.verify.mockReturnValue({ sub: 'user-1' });
      const req = {
        headers: {},
        cookies: { access_token: 'session-token' },
      } as unknown as Request;
      const dto: CommitClaimDto = { ticket: 'ticket-jwt' };

      await controller.commit('token', dto, req);

      expect(jwtService.verify).toHaveBeenCalledWith('session-token');
      const command = commit.execute.mock.calls[0][0] as CommitClaimCommand;
      expect(command).toBeInstanceOf(CommitClaimCommand);
      expect(command.token).toBe('token');
      expect(command.dto).toBe(dto);
      expect(command.sessionUserId).toBe('user-1');
    });

    it('commit sin cookie pasa sesión nula (el handler responde AUTH_REQUIRED)', async () => {
      const req = {
        headers: {},
        cookies: {},
      } as unknown as Request;

      await controller.commit('token', { ticket: 'ticket-jwt' }, req);

      expect(jwtService.verify).not.toHaveBeenCalled();
      const command = commit.execute.mock.calls[0][0] as CommitClaimCommand;
      expect(command.sessionUserId).toBeNull();
    });

    it('commit con cookie vencido o inválido no lanza: pasa sesión nula', async () => {
      jwtService.verify.mockImplementation(() => {
        throw new Error('jwt expired');
      });
      const req = {
        headers: {},
        cookies: { access_token: 'vencido' },
      } as unknown as Request;

      await expect(
        controller.commit('token', { ticket: 'ticket-jwt' }, req),
      ).resolves.toEqual({ data: {} });

      const command = commit.execute.mock.calls[0][0] as CommitClaimCommand;
      expect(command.sessionUserId).toBeNull();
    });
  });
});
