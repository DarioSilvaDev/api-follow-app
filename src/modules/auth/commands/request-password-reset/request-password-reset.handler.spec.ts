import { EventEmitter2 } from '@nestjs/event-emitter';
import { RequestPasswordResetHandler } from './request-password-reset.handler';
import { RequestPasswordResetCommand } from './request-password-reset.command';
import { PasswordResetRequestedEvent } from '../../events/password-reset-requested.event';

describe('RequestPasswordResetHandler', () => {
  let handler: RequestPasswordResetHandler;
  let prismaMock: any;
  let authRepositoryMock: any;
  let eventEmitterMock: any;
  let loggerMock: any;

  beforeEach(() => {
    prismaMock = {
      user: {
        findUnique: jest.fn(),
      },
    };
    authRepositoryMock = {
      revokeUnusedPasswordResets: jest.fn().mockResolvedValue(undefined),
      deleteCleanupPasswordResets: jest.fn().mockResolvedValue(undefined),
      createPasswordReset: jest.fn().mockResolvedValue({ id: 'pr-1' }),
    };
    eventEmitterMock = {
      emit: jest.fn(),
    };
    loggerMock = {
      info: jest.fn(),
    };

    handler = new RequestPasswordResetHandler(
      loggerMock,
      prismaMock,
      authRepositoryMock,
      eventEmitterMock,
    );
  });

  it('does nothing when email does not exist', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);

    await handler.execute(
      new RequestPasswordResetCommand('nonexistent@example.com'),
    );

    expect(
      authRepositoryMock.revokeUnusedPasswordResets,
    ).not.toHaveBeenCalled();
    expect(
      authRepositoryMock.deleteCleanupPasswordResets,
    ).not.toHaveBeenCalled();
    expect(authRepositoryMock.createPasswordReset).not.toHaveBeenCalled();
    expect(eventEmitterMock.emit).not.toHaveBeenCalled();
  });

  it('revokes unused tokens and creates new token when email exists', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
    });

    await handler.execute(new RequestPasswordResetCommand('user@example.com'));

    expect(authRepositoryMock.revokeUnusedPasswordResets).toHaveBeenCalledWith(
      'user-1',
    );
    expect(authRepositoryMock.createPasswordReset).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        token: expect.any(String),
        expiresAt: expect.any(Date),
      }),
    );
  });

  it('generates a 64-character hex token (randomBytes(32))', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
    });

    await handler.execute(new RequestPasswordResetCommand('user@example.com'));

    const call = authRepositoryMock.createPasswordReset.mock.calls[0][0];
    expect(call.token).toMatch(/^[0-9a-f]{64}$/);
  });

  it('emits PasswordResetRequestedEvent with email and token', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
    });

    await handler.execute(new RequestPasswordResetCommand('user@example.com'));

    expect(eventEmitterMock.emit).toHaveBeenCalledTimes(1);
    const emitCall = eventEmitterMock.emit.mock.calls[0];
    expect(emitCall[0]).toBe('auth.password_reset.requested');
    expect(emitCall[1]).toBeInstanceOf(PasswordResetRequestedEvent);
    expect(emitCall[1].email).toBe('user@example.com');
    expect(emitCall[1].token).toMatch(/^[0-9a-f]{64}$/);
  });

  it('revokes unused tokens on every request (multiple calls)', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
    });

    await handler.execute(new RequestPasswordResetCommand('user@example.com'));
    await handler.execute(new RequestPasswordResetCommand('user@example.com'));
    await handler.execute(new RequestPasswordResetCommand('user@example.com'));

    expect(authRepositoryMock.revokeUnusedPasswordResets).toHaveBeenCalledTimes(
      3,
    );
    expect(authRepositoryMock.createPasswordReset).toHaveBeenCalledTimes(3);
  });

  it('sets token expiry to 1 hour from now', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
    });

    const before = Date.now();
    await handler.execute(new RequestPasswordResetCommand('user@example.com'));
    const after = Date.now();

    const call = authRepositoryMock.createPasswordReset.mock.calls[0][0];
    const expiresAt = call.expiresAt.getTime();
    expect(expiresAt).toBeGreaterThanOrEqual(before + 3_600_000 - 1000);
    expect(expiresAt).toBeLessThanOrEqual(after + 3_600_000 + 1000);
  });

  it('runs opportunistic cleanup of used/expired/revoked tokens (D-033)', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
    });

    await handler.execute(new RequestPasswordResetCommand('user@example.com'));

    expect(authRepositoryMock.deleteCleanupPasswordResets).toHaveBeenCalledWith(
      'user-1',
    );
  });

  it('creates the new token only AFTER the opportunistic cleanup (D-033)', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
    });

    await handler.execute(new RequestPasswordResetCommand('user@example.com'));

    const revokeOrder =
      authRepositoryMock.revokeUnusedPasswordResets.mock.invocationCallOrder[0];
    const cleanupOrder =
      authRepositoryMock.deleteCleanupPasswordResets.mock
        .invocationCallOrder[0];
    const createOrder =
      authRepositoryMock.createPasswordReset.mock.invocationCallOrder[0];

    // Cleanup must run after revocation (D-027) and before the new token is
    // created so the freshly created token is never deleted.
    expect(revokeOrder).toBeLessThan(cleanupOrder);
    expect(cleanupOrder).toBeLessThan(createOrder);
  });
});
