import { ConflictException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { RegisterHandler } from './register.handler';
import { RegisterCommand } from './register.command';
import { UserRegisteredEvent } from '../../events/user-registered.event';
import { EmailVerificationSentEvent } from '../../events/email-verification-sent.event';

// Mock envs before the handler imports it, to avoid Joi validation failure.
jest.mock('../../../../config/envs', () => ({
  envs: {
    VERIFICATION_TOKEN_EXPIRY_HOURS: 24,
  },
}));

// Mock bcrypt so tests are fast and deterministic.
jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('$2b$10$mockedhashvalue'),
}));

// uuid@14 is an ESM-only package; mock it so the handler (which imports
// `v4 as uuid`) can be loaded by ts-jest and the token is deterministic.
jest.mock('uuid', () => ({
  v4: jest.fn().mockReturnValue('00000000-0000-4000-8000-000000000000'),
}));

describe('RegisterHandler', () => {
  let handler: RegisterHandler;
  let userRepositoryMock: any;
  let prismaMock: any;
  let eventEmitterMock: any;

  const registerCommand = (email = 'new@example.com') =>
    new RegisterCommand({
      email,
      password: 'Secret1!',
      firstName: 'Ana',
      lastName: 'Pérez',
    });

  beforeEach(() => {
    userRepositoryMock = {
      findByEmail: jest.fn(),
      create: jest.fn(),
    };
    prismaMock = {
      emailVerification: {
        create: jest.fn().mockResolvedValue({ id: 'ev-1' }),
      },
    };
    eventEmitterMock = {
      emit: jest.fn(),
    };

    handler = new RegisterHandler(
      userRepositoryMock,
      prismaMock,
      eventEmitterMock as EventEmitter2,
    );
  });

  it('throws ConflictException (409) when the email is already registered', async () => {
    userRepositoryMock.findByEmail.mockResolvedValue({
      id: 'u1',
      email: 'existing@example.com',
    });

    let caught: any;
    try {
      await handler.execute(registerCommand('existing@example.com'));
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(ConflictException);
    // D-032: duplicate registration maps to the stable D-025 code CONFLICT
    // (AllExceptionsFilter.statusToCode covers 409 → CONFLICT).
    expect(caught.getResponse()).toEqual({
      statusCode: 409,
      message: 'Ya existe una cuenta con este email',
      error: 'Conflict',
    });
  });

  it('does not create a user or emit events on duplicate registration', async () => {
    userRepositoryMock.findByEmail.mockResolvedValue({
      id: 'u1',
      email: 'existing@example.com',
    });

    await expect(
      handler.execute(registerCommand('existing@example.com')),
    ).rejects.toThrow(ConflictException);

    expect(userRepositoryMock.create).not.toHaveBeenCalled();
    expect(prismaMock.emailVerification.create).not.toHaveBeenCalled();
    expect(eventEmitterMock.emit).not.toHaveBeenCalled();
  });

  it('creates the user, stores a verification token and emits registration events', async () => {
    userRepositoryMock.findByEmail.mockResolvedValue(null);
    const createdUser = {
      id: 'u1',
      email: 'new@example.com',
      firstName: 'Ana',
      lastName: 'Pérez',
      phone: null,
      avatarUrl: null,
      language: 'es',
      status: 'pending',
      emailVerifiedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    userRepositoryMock.create.mockResolvedValue(createdUser);

    const result = await handler.execute(registerCommand());

    expect(userRepositoryMock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'new@example.com',
        firstName: 'Ana',
        lastName: 'Pérez',
        passwordHash: expect.any(String),
      }),
    );
    expect(prismaMock.emailVerification.create).toHaveBeenCalledTimes(1);
    const verificationCall =
      prismaMock.emailVerification.create.mock.calls[0][0];
    expect(verificationCall.data.userId).toBe('u1');
    expect(verificationCall.data.token).toEqual(expect.any(String));

    expect(eventEmitterMock.emit).toHaveBeenCalledTimes(2);
    const emitted = eventEmitterMock.emit.mock.calls.map(
      (call: any[]) => call[1],
    );
    expect(emitted[0]).toBeInstanceOf(UserRegisteredEvent);
    expect(emitted[0].email).toBe('new@example.com');
    expect(emitted[1]).toBeInstanceOf(EmailVerificationSentEvent);
    expect(emitted[1].email).toBe('new@example.com');
    expect(emitted[1].token).toBe(verificationCall.data.token);

    expect(result.user.email).toBe('new@example.com');
  });
});
