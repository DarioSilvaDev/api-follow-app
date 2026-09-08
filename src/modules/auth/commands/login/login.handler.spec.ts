import { JwtService } from '@nestjs/jwt';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PinoLogger } from 'nestjs-pino';
import { InvalidCredentialsException } from '../../../../common/exceptions/coded.exception';

// Mock envs before the handler imports it, to avoid Joi validation failure.
jest.mock('../../../../config/envs', () => ({
  envs: {
    MAX_LOGIN_ATTEMPTS: 5,
    ACCOUNT_LOCKOUT_MINUTES: 15,
  },
}));

// Mock bcrypt so tests are fast and deterministic.
jest.mock('bcrypt', () => ({
  compare: jest.fn().mockResolvedValue(false),
}));

// Defer actual imports until mocks are in place.
let LoginHandler: typeof import('./login.handler').LoginHandler;
let LoginCommand: typeof import('./login.command').LoginCommand;

beforeAll(async () => {
  LoginHandler = (await import('./login.handler')).LoginHandler;
  LoginCommand = (await import('./login.command')).LoginCommand;
});

describe('LoginHandler — account enumeration (Security Review #12)', () => {
  let handler: any;
  let prismaMock: any;
  let authRepositoryMock: any;
  let roleServiceMock: any;
  let jwtServiceMock: any;
  let eventEmitterMock: any;
  let loggerMock: any;
  const bcrypt = require('bcrypt') as { compare: jest.Mock };

  const loginCommand = (email = 'x@example.com', password = 'secret') =>
    new LoginCommand({ email, password } as any);

  beforeEach(() => {
    prismaMock = {
      user: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      userCredential: {
        update: jest.fn(),
      },
    };
    authRepositoryMock = { createSession: jest.fn() };
    roleServiceMock = { loadUserRoles: jest.fn().mockResolvedValue(['user']) };
    jwtServiceMock = { sign: jest.fn().mockReturnValue('token') };
    eventEmitterMock = { emit: jest.fn() };
    loggerMock = { info: jest.fn() };

    handler = new LoginHandler(
      loggerMock as PinoLogger,
      prismaMock,
      authRepositoryMock,
      jwtServiceMock as JwtService,
      eventEmitterMock as EventEmitter2,
      roleServiceMock,
    );

    bcrypt.compare.mockReset();
    bcrypt.compare.mockResolvedValue(false);
  });

  it('does NOT log the email at info level', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);

    await handler.execute(loginCommand()).catch(() => undefined);

    const logged = loggerMock.info.mock.calls.flat().map((c: any) =>
      typeof c === 'string' ? c : JSON.stringify(c),
    );
    const joined = logged.join(' ');
    expect(joined).not.toContain('x@example.com');
  });

  it('returns uniform 401 INVALID_CREDENTIALS for a nonexistent user', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);

    await expect(handler.execute(loginCommand())).rejects.toThrow(
      InvalidCredentialsException,
    );
  });

  it('returns uniform 401 INVALID_CREDENTIALS for a locked account', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'u1',
      status: 'active',
      credential: {
        passwordHash: '$2b$10$abcdefghijklmnopqrstuv',
        lockedUntil: new Date(Date.now() + 60000),
        failedAttempts: 5,
      },
    });

    await expect(handler.execute(loginCommand())).rejects.toThrow(
      InvalidCredentialsException,
    );
    // No specific "locked" message — all failures share the same exception type.
  });

  it('returns uniform 401 INVALID_CREDENTIALS for a pending account', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'u1',
      status: 'pending',
      credential: {
        passwordHash: '$2b$10$abcdefghijklmnopqrstuv',
        lockedUntil: null,
        failedAttempts: 0,
      },
    });

    await expect(handler.execute(loginCommand())).rejects.toThrow(
      InvalidCredentialsException,
    );
  });

  it('returns uniform 401 INVALID_CREDENTIALS for a suspended account', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'u1',
      status: 'suspended',
      credential: {
        passwordHash: '$2b$10$abcdefghijklmnopqrstuv',
        lockedUntil: null,
        failedAttempts: 0,
      },
    });

    await expect(handler.execute(loginCommand())).rejects.toThrow(
      InvalidCredentialsException,
    );
  });

  it('increments failed attempts and returns INVALID_CREDENTIALS on wrong password', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'u1',
      status: 'active',
      credential: {
        passwordHash: '$2b$10$abcdefghijklmnopqrstuv',
        lockedUntil: null,
        failedAttempts: 0,
      },
    });

    await expect(handler.execute(loginCommand())).rejects.toThrow(
      InvalidCredentialsException,
    );
    expect(prismaMock.userCredential.update).toHaveBeenCalledWith({
      where: { userId: 'u1' },
      data: { failedAttempts: 1 },
    });
  });
});