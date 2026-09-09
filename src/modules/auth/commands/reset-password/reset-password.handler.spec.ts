import { UnauthorizedException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ResetPasswordHandler } from './reset-password.handler';
import { ResetPasswordCommand } from './reset-password.command';
import { PasswordResetCompletedEvent } from '../../events/password-reset-completed.event';

// Mock bcrypt so tests are fast and deterministic.
jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('$2b$10$mockedhashvalue'),
}));

describe('ResetPasswordHandler', () => {
  let handler: ResetPasswordHandler;
  let authRepositoryMock: any;
  let prismaMock: any;
  let eventEmitterMock: any;
  let loggerMock: any;
  let txMock: any;
  const bcrypt = require('bcrypt') as { hash: jest.Mock };

  beforeEach(() => {
    authRepositoryMock = {
      findPasswordResetByToken: jest.fn(),
    };
    txMock = {
      userCredential: {
        update: jest.fn().mockResolvedValue({}),
      },
      passwordReset: {
        update: jest.fn().mockResolvedValue({}),
      },
      userSession: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    prismaMock = {
      $transaction: jest.fn(async (cb: (tx: any) => unknown) => cb(txMock)),
    };
    eventEmitterMock = {
      emit: jest.fn(),
    };
    loggerMock = {
      info: jest.fn(),
    };

    handler = new ResetPasswordHandler(
      loggerMock as any,
      prismaMock as any,
      authRepositoryMock as any,
      eventEmitterMock as any,
    );

    bcrypt.hash.mockReset();
    bcrypt.hash.mockResolvedValue('$2b$10$mockedhashvalue');
  });

  it('throws UnauthorizedException when token does not exist', async () => {
    authRepositoryMock.findPasswordResetByToken.mockResolvedValue(null);

    await expect(
      handler.execute(new ResetPasswordCommand('invalid-token', 'NewPass1!')),
    ).rejects.toThrow(UnauthorizedException);

    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('throws UnauthorizedException when token is already used', async () => {
    authRepositoryMock.findPasswordResetByToken.mockResolvedValue({
      id: 'pr-1',
      userId: 'user-1',
      usedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    });

    await expect(
      handler.execute(new ResetPasswordCommand('used-token', 'NewPass1!')),
    ).rejects.toThrow(UnauthorizedException);

    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('throws UnauthorizedException when token is expired', async () => {
    authRepositoryMock.findPasswordResetByToken.mockResolvedValue({
      id: 'pr-1',
      userId: 'user-1',
      usedAt: null,
      expiresAt: new Date(Date.now() - 1000),
    });

    await expect(
      handler.execute(new ResetPasswordCommand('expired-token', 'NewPass1!')),
    ).rejects.toThrow(UnauthorizedException);

    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('calls prisma.$transaction with userCredential, passwordReset, and userSession updates', async () => {
    authRepositoryMock.findPasswordResetByToken.mockResolvedValue({
      id: 'pr-1',
      userId: 'user-1',
      usedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    });

    await handler.execute(
      new ResetPasswordCommand('valid-token', 'NewPass1!'),
    );

    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);

    // The transaction callback should have called all three updates
    expect(txMock.userCredential.update).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      data: expect.objectContaining({
        passwordHash: '$2b$10$mockedhashvalue',
        failedAttempts: 0,
        lockedUntil: null,
      }),
    });

    expect(txMock.passwordReset.update).toHaveBeenCalledWith({
      where: { id: 'pr-1' },
      data: { usedAt: expect.any(Date) },
    });

    expect(txMock.userSession.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it('updates userCredential with failedAttempts: 0 and lockedUntil: null', async () => {
    authRepositoryMock.findPasswordResetByToken.mockResolvedValue({
      id: 'pr-1',
      userId: 'user-1',
      usedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    });

    await handler.execute(
      new ResetPasswordCommand('valid-token', 'NewPass1!'),
    );

    const updateCall = txMock.userCredential.update.mock.calls[0][0];
    expect(updateCall.data.failedAttempts).toBe(0);
    expect(updateCall.data.lockedUntil).toBeNull();
  });

  it('emits PasswordResetCompletedEvent after successful reset', async () => {
    authRepositoryMock.findPasswordResetByToken.mockResolvedValue({
      id: 'pr-1',
      userId: 'user-1',
      usedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    });

    await handler.execute(
      new ResetPasswordCommand('valid-token', 'NewPass1!'),
    );

    expect(eventEmitterMock.emit).toHaveBeenCalledTimes(1);
    const emitCall = eventEmitterMock.emit.mock.calls[0];
    expect(emitCall[0]).toBe('auth.password_reset.completed');
    expect(emitCall[1]).toBeInstanceOf(PasswordResetCompletedEvent);
    expect(emitCall[1].userId).toBe('user-1');
  });

  it('hashes password with bcrypt using 10 rounds', async () => {
    authRepositoryMock.findPasswordResetByToken.mockResolvedValue({
      id: 'pr-1',
      userId: 'user-1',
      usedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    });

    await handler.execute(
      new ResetPasswordCommand('valid-token', 'NewPass1!'),
    );

    expect(bcrypt.hash).toHaveBeenCalledWith('NewPass1!', 10);
  });

  it('does not emit event when token is invalid', async () => {
    authRepositoryMock.findPasswordResetByToken.mockResolvedValue(null);

    await expect(
      handler.execute(new ResetPasswordCommand('bad', 'pass')),
    ).rejects.toThrow(UnauthorizedException);

    expect(eventEmitterMock.emit).not.toHaveBeenCalled();
  });

  it('passes the hashed password (not plain) to userCredential.update', async () => {
    bcrypt.hash.mockResolvedValue('$2b$12$specialhash');
    authRepositoryMock.findPasswordResetByToken.mockResolvedValue({
      id: 'pr-1',
      userId: 'user-1',
      usedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    });

    await handler.execute(
      new ResetPasswordCommand('valid-token', 'MyP@ssw0rd'),
    );

    expect(txMock.userCredential.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          passwordHash: '$2b$12$specialhash',
        }),
      }),
    );
  });
});
