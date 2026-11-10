import 'reflect-metadata';
import { ForbiddenException } from '@nestjs/common';
import { GUARDS_METADATA, HTTP_CODE_METADATA } from '@nestjs/common/constants';
import type { Response } from 'express';
import { ContextGuard } from '../../../common/context/guards/context.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { WorkshopOnlyGuard } from '../../../common/guards/workshop-only.guard';
import { JwtAuthGuard } from '../../auth/strategies/jwt-auth.guard';
import { CreateClaimInviteCommand } from '../commands/create-claim-invite/create-claim-invite.command';
import { ReviewClaimCommand } from '../commands/review-claim/review-claim.command';
import { RevokeClaimCommand } from '../commands/revoke-claim/revoke-claim.command';
import { VehicleClaimsController } from './vehicle-claims.controller';

describe('VehicleClaimsController — guards, permisos y contrato', () => {
  let controller: VehicleClaimsController;
  let createHandler: { execute: jest.Mock };
  let listHandler: { execute: jest.Mock };
  let getHandler: { execute: jest.Mock };
  let reviewHandler: { execute: jest.Mock };
  let revokeHandler: { execute: jest.Mock };
  let res: { status: jest.Mock };

  const workshopId = '33333333-3333-3333-3333-333333333333';
  const userId = '44444444-4444-4444-4444-444444444444';
  const memberId = 'member-1';
  const id = '11111111-1111-1111-1111-111111111111';

  const workshopCtx = {
    type: 'WORKSHOP' as const,
    userId,
    workshopId,
    memberId,
    roleId: 'role-1',
  };
  const personalCtx = { type: 'PERSONAL' as const, userId };

  function proto(method: keyof VehicleClaimsController) {
    return VehicleClaimsController.prototype[method] as object;
  }

  function guardsOf(method: keyof VehicleClaimsController): unknown[] {
    return Reflect.getMetadata(GUARDS_METADATA, proto(method)) as unknown[];
  }

  function permissionsOf(method: keyof VehicleClaimsController): string[] {
    return Reflect.getMetadata('permissions', proto(method)) as string[];
  }

  beforeEach(() => {
    createHandler = {
      execute: jest.fn().mockResolvedValue({ data: {}, reused: false }),
    };
    listHandler = {
      execute: jest.fn().mockResolvedValue({ data: [], meta: {} }),
    };
    getHandler = { execute: jest.fn().mockResolvedValue({ data: {} }) };
    reviewHandler = { execute: jest.fn().mockResolvedValue({ data: {} }) };
    revokeHandler = { execute: jest.fn().mockResolvedValue({ data: {} }) };
    res = { status: jest.fn() };

    controller = new VehicleClaimsController(
      createHandler as never,
      listHandler as never,
      getHandler as never,
      reviewHandler as never,
      revokeHandler as never,
    );
  });

  describe('orden de guards por reflection', () => {
    it('clase: JwtAuthGuard + ContextGuard en ese orden', () => {
      expect(
        Reflect.getMetadata(GUARDS_METADATA, VehicleClaimsController),
      ).toEqual([JwtAuthGuard, ContextGuard]);
    });

    it.each(['create', 'list', 'get', 'approve', 'reject', 'revoke'] as const)(
      '%s: WorkshopOnly ANTES de Permissions',
      (method) => {
        expect(guardsOf(method)).toEqual([WorkshopOnlyGuard, PermissionsGuard]);
      },
    );

    it('permisos por método', () => {
      expect(permissionsOf('create')).toEqual(['vehicle-claim.create']);
      expect(permissionsOf('list')).toEqual(['vehicle-claim.list']);
      expect(permissionsOf('get')).toEqual(['vehicle-claim.list']);
      expect(permissionsOf('approve')).toEqual(['vehicle-claim.review']);
      expect(permissionsOf('reject')).toEqual(['vehicle-claim.review']);
      expect(permissionsOf('revoke')).toEqual(['vehicle-claim.revoke']);
    });

    it('approve/reject/revoke responden 200 explícito', () => {
      expect(Reflect.getMetadata(HTTP_CODE_METADATA, proto('approve'))).toBe(
        200,
      );
      expect(Reflect.getMetadata(HTTP_CODE_METADATA, proto('reject'))).toBe(
        200,
      );
      expect(Reflect.getMetadata(HTTP_CODE_METADATA, proto('revoke'))).toBe(
        200,
      );
    });
  });

  describe('create — 201/200', () => {
    it('emisión nueva → 201', async () => {
      await controller.create(
        { vehicleId: 'vehicle-1' },
        workshopCtx,
        { id: userId, email: 'x@example.com' },
        res as unknown as Response,
      );

      expect(createHandler.execute).toHaveBeenCalledWith(
        expect.any(CreateClaimInviteCommand),
      );
      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('reutilización/reactivación → 200', async () => {
      createHandler.execute.mockResolvedValue({ data: {}, reused: true });

      await controller.create(
        { vehicleId: 'vehicle-1' },
        workshopCtx,
        { id: userId, email: 'x@example.com' },
        res as unknown as Response,
      );

      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  describe('PERSONAL → 403 en todos los métodos', () => {
    it('create', async () => {
      await expect(
        controller.create(
          { vehicleId: 'vehicle-1' },
          personalCtx,
          { id: userId, email: 'x@example.com' },
          res as unknown as Response,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it.each(['list', 'get', 'approve', 'reject', 'revoke'] as const)(
      '%s',
      async (method) => {
        const call = (controller[method] as (...args: never[]) => unknown).bind(
          controller,
        );
        const args =
          method === 'list'
            ? [personalCtx]
            : method === 'revoke'
              ? [id, {}, personalCtx, { id: userId, email: 'x@example.com' }]
              : [id, personalCtx, { id: userId, email: 'x@example.com' }];

        await expect(
          (call as (...a: unknown[]) => unknown)(...args),
        ).rejects.toBeInstanceOf(ForbiddenException);
      },
    );
  });

  describe('delegación', () => {
    it('list sanea page/limit y pasa status', async () => {
      await controller.list(workshopCtx, '2', '50', 'claimed');

      expect(listHandler.execute).toHaveBeenCalledWith({
        workshopId,
        page: 2,
        limit: 50,
        status: 'claimed',
      });
    });

    it('list con page no numérica delega undefined (el handler defaultea)', async () => {
      await controller.list(workshopCtx, 'abc');

      expect(listHandler.execute).toHaveBeenCalledWith({
        workshopId,
        page: undefined,
        limit: undefined,
        status: undefined,
      });
    });

    it('get pasa el workshopId del contexto y el userId de la sesión', async () => {
      await controller.get(id, workshopCtx, {
        id: userId,
        email: 'x@example.com',
      });

      expect(getHandler.execute).toHaveBeenCalledWith({
        id,
        workshopId,
        userId,
      });
    });

    it('approve construye el comando con acción approve', async () => {
      await controller.approve(id, workshopCtx, {
        id: userId,
        email: 'x@example.com',
      });

      const command = reviewHandler.execute.mock
        .calls[0][0] as ReviewClaimCommand;
      expect(command).toBeInstanceOf(ReviewClaimCommand);
      expect(command).toMatchObject({
        id,
        workshopId,
        memberId,
        userId,
        action: 'approve',
      });
    });

    it('reject construye el comando con acción reject', async () => {
      await controller.reject(id, workshopCtx, {
        id: userId,
        email: 'x@example.com',
      });

      const command = reviewHandler.execute.mock
        .calls[0][0] as ReviewClaimCommand;
      expect(command.action).toBe('reject');
    });

    it('revoke pasa el motivo libre y el userId', async () => {
      await controller.revoke(id, { reason: 'link filtrado' }, workshopCtx, {
        id: userId,
        email: 'x@example.com',
      });

      const command = revokeHandler.execute.mock
        .calls[0][0] as RevokeClaimCommand;
      expect(command).toBeInstanceOf(RevokeClaimCommand);
      expect(command).toMatchObject({
        id,
        workshopId,
        userId,
        reason: 'link filtrado',
      });
    });
  });
});
