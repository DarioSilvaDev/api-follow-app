import {
  BadRequestException,
  ConflictException,
  HttpStatus,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CodedHttpException } from '../../../../common/exceptions/coded.exception';
import { ERROR_CODES } from '../../../../common/exceptions/error-codes';
import { UpdateMyAliasHandler } from './update-my-alias.handler';

describe('UpdateMyAliasHandler — Fase 2 (D-077/D-091) PATCH /users/me/alias', () => {
  let handler: UpdateMyAliasHandler;
  let prismaMock: any;
  let getMyAliasMock: { execute: jest.Mock };

  const NOW = new Date('2026-01-20T00:00:00.000Z');

  const userWith = (overrides: Record<string, unknown>) => ({
    id: 'u-1',
    alias: null,
    lastAliasChangedAt: null,
    ...overrides,
  });

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
    prismaMock = {
      user: { findUnique: jest.fn(), update: jest.fn() },
      vehicleTransfer: { findFirst: jest.fn() },
    };
    getMyAliasMock = { execute: jest.fn() };
    handler = new UpdateMyAliasHandler(prismaMock, getMyAliasMock as any);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('initial grant (no alias before) sets lowercase and seals lastAliasChangedAt', async () => {
    prismaMock.user.findUnique.mockResolvedValue(userWith({}));
    getMyAliasMock.execute.mockResolvedValue({
      alias: 'mi_alias',
      lastAliasChangedAt: NOW,
      nextChangeAllowedAt: new Date('2026-02-04T00:00:00.000Z'),
    });

    const result = await handler.execute('u-1', { alias: '  Mi_Alias ' });

    expect(prismaMock.vehicleTransfer.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: 'u-1' },
      data: { alias: 'mi_alias', lastAliasChangedAt: NOW },
    });
    expect(result.alias).toBe('mi_alias');
  });

  it('re-sending the exact current non-null alias is a no-op (no pending, no cooldown, no update)', async () => {
    prismaMock.user.findUnique.mockResolvedValue(
      userWith({ alias: 'ana_p', lastAliasChangedAt: NOW }),
    );
    getMyAliasMock.execute.mockResolvedValue({
      alias: 'ana_p',
      lastAliasChangedAt: NOW,
      nextChangeAllowedAt: new Date('2026-02-04T00:00:00.000Z'),
    });

    const result = await handler.execute('u-1', { alias: 'ANA_P' });

    expect(prismaMock.user.update).not.toHaveBeenCalled();
    expect(prismaMock.vehicleTransfer.findFirst).not.toHaveBeenCalled();
    expect(result.alias).toBe('ana_p');
  });

  it('empty body ({}) is a no-op and never deletes the existing alias', async () => {
    prismaMock.user.findUnique.mockResolvedValue(
      userWith({ alias: 'ana_p', lastAliasChangedAt: NOW }),
    );
    getMyAliasMock.execute.mockResolvedValue({
      alias: 'ana_p',
      lastAliasChangedAt: NOW,
      nextChangeAllowedAt: new Date('2026-02-04T00:00:00.000Z'),
    });

    const result = await handler.execute('u-1', {});

    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.user.update).not.toHaveBeenCalled();
    expect(result.alias).toBe('ana_p');
  });

  it('409 when the alias is already in use (case-insensitive)', async () => {
    prismaMock.user.findUnique
      .mockResolvedValueOnce(userWith({})) // the requesting user
      .mockResolvedValueOnce({ id: 'u-other' }); // existing alias holder

    let thrown: any;
    try {
      await handler.execute('u-1', { alias: 'juan_gomez' });
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(ConflictException);
    expect(thrown.message).toBe('El alias ya está en uso');
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it('409 change within cooldown emits CodedHttpException with structured errors (D-025 + ALIAS_COOLDOWN)', async () => {
    prismaMock.user.findUnique.mockResolvedValue(
      userWith({
        alias: 'viejo',
        lastAliasChangedAt: new Date('2026-01-15T00:00:00.000Z'),
      }),
    );

    await expect(
      handler.execute('u-1', { alias: 'nuevo_alias' }),
    ).rejects.toBeInstanceOf(CodedHttpException);
    await expect(
      handler.execute('u-1', { alias: 'nuevo_alias' }),
    ).rejects.toMatchObject({
      status: HttpStatus.CONFLICT,
      response: {
        statusCode: HttpStatus.CONFLICT,
        code: ERROR_CODES.CONFLICT,
        // Byte-idéntico al texto previo (el frontend clasifica por "15 días").
        message:
          'Solo podés cambiar tu alias cada 15 días. Podés cambiarlo el 2026-01-30',
        errors: {
          code: 'ALIAS_COOLDOWN',
          nextChangeAllowedAt: '2026-01-30T00:00:00.000Z',
          nextChangeAllowedDate: '2026-01-30',
        },
      },
    });
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it('409 delete within cooldown (structured errors)', async () => {
    prismaMock.user.findUnique.mockResolvedValue(
      userWith({
        alias: 'viejo',
        lastAliasChangedAt: new Date('2026-01-15T00:00:00.000Z'),
      }),
    );

    await expect(handler.execute('u-1', { alias: null })).rejects.toMatchObject(
      {
        status: HttpStatus.CONFLICT,
        response: {
          statusCode: HttpStatus.CONFLICT,
          code: ERROR_CODES.CONFLICT,
          errors: {
            code: 'ALIAS_COOLDOWN',
            nextChangeAllowedAt: '2026-01-30T00:00:00.000Z',
            nextChangeAllowedDate: '2026-01-30',
          },
        },
      },
    );
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it('409 when re-PATCHing { alias: null } within cooldown after a recent deletion (AC §10 / §6.5)', async () => {
    prismaMock.user.findUnique.mockResolvedValue(
      userWith({ lastAliasChangedAt: new Date('2026-01-15T00:00:00.000Z') }),
    );

    await expect(handler.execute('u-1', { alias: null })).rejects.toMatchObject(
      {
        status: HttpStatus.CONFLICT,
        response: {
          statusCode: HttpStatus.CONFLICT,
          code: ERROR_CODES.CONFLICT,
          errors: {
            code: 'ALIAS_COOLDOWN',
            nextChangeAllowedAt: '2026-01-30T00:00:00.000Z',
            nextChangeAllowedDate: '2026-01-30',
          },
        },
      },
    );
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it('null-noop outside cooldown → 200 without sealing a spurious timestamp', async () => {
    prismaMock.user.findUnique.mockResolvedValue(
      userWith({ lastAliasChangedAt: new Date('2026-01-01T00:00:00.000Z') }),
    );
    getMyAliasMock.execute.mockResolvedValue({
      alias: null,
      lastAliasChangedAt: null,
      nextChangeAllowedAt: null,
    });

    const result = await handler.execute('u-1', { alias: null });

    expect(prismaMock.user.update).not.toHaveBeenCalled();
    expect(result.alias).toBeNull();
  });

  it('delete outside cooldown is allowed and seals lastAliasChangedAt', async () => {
    prismaMock.user.findUnique.mockResolvedValue(
      userWith({
        alias: 'viejo',
        lastAliasChangedAt: new Date('2026-01-01T00:00:00.000Z'),
      }),
    );
    getMyAliasMock.execute.mockResolvedValue({
      alias: null,
      lastAliasChangedAt: NOW,
      nextChangeAllowedAt: new Date('2026-02-04T00:00:00.000Z'),
    });

    await handler.execute('u-1', { alias: null });

    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: 'u-1' },
      data: { alias: null, lastAliasChangedAt: NOW },
    });
  });

  it('409 D-077 changing alias while pending transfer exists', async () => {
    prismaMock.user.findUnique.mockResolvedValue(
      userWith({
        alias: 'viejo',
        lastAliasChangedAt: new Date('2026-01-01T00:00:00.000Z'),
      }),
    );
    prismaMock.vehicleTransfer.findFirst.mockResolvedValue({ id: 'pending-1' });

    let thrown: any;
    try {
      await handler.execute('u-1', { alias: 'nuevo' });
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(ConflictException);
    expect(thrown.message).toContain('transferencia pendiente');
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it('409 D-077 deleting alias while pending transfer exists', async () => {
    prismaMock.user.findUnique.mockResolvedValue(
      userWith({
        alias: 'viejo',
        lastAliasChangedAt: new Date('2026-01-01T00:00:00.000Z'),
      }),
    );
    prismaMock.vehicleTransfer.findFirst.mockResolvedValue({ id: 'pending-1' });

    const dto = { alias: null };
    let thrown: any;
    try {
      await handler.execute('u-1', dto);
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(ConflictException);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it('initial grant is allowed even with a pending transfer (no frozen identity)', async () => {
    prismaMock.user.findUnique.mockResolvedValue(userWith({}));
    getMyAliasMock.execute.mockResolvedValue({
      alias: 'primer_alias',
      lastAliasChangedAt: NOW,
      nextChangeAllowedAt: new Date('2026-02-04T00:00:00.000Z'),
    });

    const result = await handler.execute('u-1', { alias: 'primer_alias' });

    expect(prismaMock.vehicleTransfer.findFirst).not.toHaveBeenCalled();
    expect(result.alias).toBe('primer_alias');
  });

  it('throws BadRequestException when the user does not exist', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);

    let thrown: any;
    try {
      await handler.execute('u-ghost', { alias: 'algo' });
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(BadRequestException);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it('P2002 from the functional lower index (race) → 409 "Elegí otro", not 500', async () => {
    prismaMock.user.findUnique.mockResolvedValue(userWith({}));
    prismaMock.user.update.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '6.19.3',
        meta: { target: ['users_alias_lower_idx'] },
      }),
    );

    let thrown: any;
    try {
      await handler.execute('u-1', { alias: 'nuevo_alias' });
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(ConflictException);
    expect(thrown.message).toBe('El alias ya está en uso. Elegí otro.');
  });
});
