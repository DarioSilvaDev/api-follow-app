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
      // `emit` para el evento que no necesita resultado (D-109: fire-and-forget)
      // y `emitAsync` para el que sí lo necesita (D-111: reportar el estado).
      emit: jest.fn(),
      emitAsync: jest.fn().mockResolvedValue([{ ok: true }]),
    };

    handler = new RegisterHandler(
      userRepositoryMock,
      prismaMock,
      eventEmitterMock as unknown as EventEmitter2,
    );
  });

  /** Usuario pendiente de verificación, que es el estado tras el registro. */
  const pendingUser = (email = 'new@example.com') => ({
    id: 'u1',
    email,
    firstName: 'Ana',
    lastName: 'Pérez',
    phone: null,
    avatarUrl: null,
    language: 'es',
    status: 'pending',
    emailVerifiedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
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
    const createdUser = pendingUser();
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

    expect(eventEmitterMock.emit).toHaveBeenCalledTimes(1);
    expect(eventEmitterMock.emit.mock.calls[0][0]).toBe('auth.user.registered');
    expect(eventEmitterMock.emit.mock.calls[0][1]).toBeInstanceOf(
      UserRegisteredEvent,
    );

    // D-111: el email de verificación se emite por `emitAsync` porque el
    // handler necesita conocer su resultado para informarlo al usuario.
    expect(eventEmitterMock.emitAsync).toHaveBeenCalledTimes(1);
    const asyncArgs = eventEmitterMock.emitAsync.mock.calls[0];
    expect(asyncArgs[0]).toBe('auth.email.verification.sent');
    expect(asyncArgs[1]).toBeInstanceOf(EmailVerificationSentEvent);
    expect(asyncArgs[1].email).toBe('new@example.com');
    // El token emitido es EXACTAMENTE el persistido: un desalineamiento
    // produciría un link de verificación muerto sin ningún error visible.
    expect(asyncArgs[1].token).toBe(verificationCall.data.token);

    expect(result.user.email).toBe('new@example.com');
  });

  describe('D-110 / D-111: el fallo de email nunca revierte el registro', () => {
    beforeEach(() => {
      userRepositoryMock.findByEmail.mockResolvedValue(null);
      userRepositoryMock.create.mockResolvedValue(pendingUser());
    });

    it('reporta state=accepted cuando el relay SMTP acepta el mensaje', async () => {
      eventEmitterMock.emitAsync.mockResolvedValue([{ ok: true }]);

      const result = await handler.execute(registerCommand());

      expect(result.emailVerification.state).toBe('accepted');
    });

    it('reporta state=failed sin lanzar cuando el envío falla', async () => {
      eventEmitterMock.emitAsync.mockResolvedValue([
        { ok: false, code: 'ETIMEDOUT', permanent: false, attempts: 3 },
      ]);

      const result = await handler.execute(registerCommand());

      // D-109: la cuenta YA existe. Si esto lanzara, el usuario vería un 5xx
      // y al reintentar recibiría 409 "ya existe una cuenta con este email",
      // sin entender que él mismo acaba de crearla.
      expect(result.emailVerification.state).toBe('failed');
      expect(result.user.id).toBe('u1');
    });

    it('reporta state=failed sin lanzar si la propia emisión revienta', async () => {
      eventEmitterMock.emitAsync.mockRejectedValue(
        new Error('listener exploded'),
      );

      const result = await handler.execute(registerCommand());

      expect(result.emailVerification.state).toBe('failed');
      expect(result.user.id).toBe('u1');
    });

    it('reporta state=failed si no hay ningun listener registrado', async () => {
      // EventEmitter2 devuelve [] cuando nadie escucha el evento.
      eventEmitterMock.emitAsync.mockResolvedValue([]);

      const result = await handler.execute(registerCommand());

      expect(result.emailVerification.state).toBe('failed');
    });

    it('D-115: nunca ofrece un estado "delivered" (no hay DSN ni webhook)', async () => {
      eventEmitterMock.emitAsync.mockResolvedValue([{ ok: true }]);

      const result = await handler.execute(registerCommand());

      expect(Object.keys(result.emailVerification)).toEqual(['state']);
      expect(result.emailVerification).not.toHaveProperty('delivered');
      expect(['accepted', 'failed']).toContain(result.emailVerification.state);
    });
  });
});
