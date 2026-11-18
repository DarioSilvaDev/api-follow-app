import { UnauthorizedException } from '@nestjs/common';
import { ValidatePasswordResetTokenHandler } from './validate-password-reset-token.handler';

describe('ValidatePasswordResetTokenHandler', () => {
  let handler: ValidatePasswordResetTokenHandler;
  let authRepositoryMock: any;

  beforeEach(() => {
    authRepositoryMock = {
      findPasswordResetByToken: jest.fn(),
      // Se mockea para poder assertir que NUNCA se llama: el handler es
      // de solo lectura y no debe consumir el token.
      markPasswordResetUsed: jest.fn(),
      revokeUnusedPasswordResets: jest.fn(),
      deleteCleanupPasswordResets: jest.fn(),
      createPasswordReset: jest.fn(),
    };

    handler = new ValidatePasswordResetTokenHandler(authRepositoryMock);
  });

  it('returns { valid: true } for an existing, unused, unexpired token', async () => {
    authRepositoryMock.findPasswordResetByToken.mockResolvedValue({
      id: 'pr-1',
      userId: 'user-1',
      usedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    });

    const result = await handler.execute('a'.repeat(64));

    expect(result).toEqual({ valid: true });
    expect(authRepositoryMock.findPasswordResetByToken).toHaveBeenCalledTimes(
      1,
    );
    expect(authRepositoryMock.findPasswordResetByToken).toHaveBeenCalledWith(
      'a'.repeat(64),
    );
  });

  it('throws UnauthorizedException when the token does not exist', async () => {
    authRepositoryMock.findPasswordResetByToken.mockResolvedValue(null);

    await expect(handler.execute('b'.repeat(64))).rejects.toThrow(
      UnauthorizedException,
    );
    await expect(handler.execute('b'.repeat(64))).rejects.toThrow(
      'Enlace inválido o expirado',
    );
  });

  it('throws UnauthorizedException when the token was already used (usedAt != null)', async () => {
    authRepositoryMock.findPasswordResetByToken.mockResolvedValue({
      id: 'pr-1',
      userId: 'user-1',
      usedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    });

    await expect(handler.execute('c'.repeat(64))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('throws UnauthorizedException when the token is expired', async () => {
    authRepositoryMock.findPasswordResetByToken.mockResolvedValue({
      id: 'pr-1',
      userId: 'user-1',
      usedAt: null,
      expiresAt: new Date(Date.now() - 1000),
    });

    await expect(handler.execute('d'.repeat(64))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('does not consume/mutate the token on the success path', async () => {
    authRepositoryMock.findPasswordResetByToken.mockResolvedValue({
      id: 'pr-1',
      userId: 'user-1',
      usedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    });

    await handler.execute('e'.repeat(64));

    expect(authRepositoryMock.markPasswordResetUsed).not.toHaveBeenCalled();
    expect(
      authRepositoryMock.revokeUnusedPasswordResets,
    ).not.toHaveBeenCalled();
    expect(
      authRepositoryMock.deleteCleanupPasswordResets,
    ).not.toHaveBeenCalled();
    expect(authRepositoryMock.createPasswordReset).not.toHaveBeenCalled();
  });

  it('does not consume/mutate the token on the failure paths', async () => {
    authRepositoryMock.findPasswordResetByToken.mockResolvedValue(null);
    await expect(handler.execute('f'.repeat(64))).rejects.toThrow(
      UnauthorizedException,
    );

    authRepositoryMock.findPasswordResetByToken.mockResolvedValue({
      id: 'pr-2',
      userId: 'user-1',
      usedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    });
    await expect(handler.execute('f'.repeat(64))).rejects.toThrow(
      UnauthorizedException,
    );

    authRepositoryMock.findPasswordResetByToken.mockResolvedValue({
      id: 'pr-3',
      userId: 'user-1',
      usedAt: null,
      expiresAt: new Date(Date.now() - 1000),
    });
    await expect(handler.execute('f'.repeat(64))).rejects.toThrow(
      UnauthorizedException,
    );

    expect(authRepositoryMock.markPasswordResetUsed).not.toHaveBeenCalled();
    expect(
      authRepositoryMock.revokeUnusedPasswordResets,
    ).not.toHaveBeenCalled();
    expect(
      authRepositoryMock.deleteCleanupPasswordResets,
    ).not.toHaveBeenCalled();
  });

  it('is idempotent: repeated validations of the same token all succeed', async () => {
    const reset = {
      id: 'pr-1',
      userId: 'user-1',
      usedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    };
    authRepositoryMock.findPasswordResetByToken.mockResolvedValue(reset);

    await expect(handler.execute('a'.repeat(64))).resolves.toEqual({
      valid: true,
    });
    await expect(handler.execute('a'.repeat(64))).resolves.toEqual({
      valid: true,
    });
    expect(authRepositoryMock.findPasswordResetByToken).toHaveBeenCalledTimes(
      2,
    );
    expect(authRepositoryMock.markPasswordResetUsed).not.toHaveBeenCalled();
  });
});
