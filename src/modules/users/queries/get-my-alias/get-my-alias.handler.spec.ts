import { GetMyAliasHandler } from './get-my-alias.handler';

describe('GetMyAliasHandler — Fase 2 (D-077/D-091) GET /users/me/alias', () => {
  let handler: GetMyAliasHandler;
  let prismaMock: { user: { findUnique: jest.Mock } };

  const baseUser = {
    alias: 'ana_p',
    lastAliasChangedAt: new Date('2026-01-01T00:00:00.000Z'),
  };

  beforeEach(() => {
    prismaMock = { user: { findUnique: jest.fn() } };
    handler = new GetMyAliasHandler(prismaMock as any);
  });

  it('returns alias + lastAliasChangedAt + nextChangeAllowedAt (+15 days) when the user has an alias', async () => {
    prismaMock.user.findUnique.mockResolvedValue(baseUser);

    const result = await handler.execute('u-1');

    expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'u-1' },
      select: { alias: true, lastAliasChangedAt: true },
    });
    expect(result).toEqual({
      alias: 'ana_p',
      lastAliasChangedAt: baseUser.lastAliasChangedAt,
      nextChangeAllowedAt: new Date('2026-01-16T00:00:00.000Z'),
    });
  });

  it('returns nulls for a user without alias', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      alias: null,
      lastAliasChangedAt: null,
    });

    const result = await handler.execute('u-2');

    expect(result).toEqual({
      alias: null,
      lastAliasChangedAt: null,
      nextChangeAllowedAt: null,
    });
  });

  it('returns nextChangeAllowedAt when alias is null but lastAliasChangedAt exists (post-deletion cooldown, D-091)', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      alias: null,
      lastAliasChangedAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    const result = await handler.execute('u-4');

    expect(result).toEqual({
      alias: null,
      lastAliasChangedAt: new Date('2026-01-01T00:00:00.000Z'),
      nextChangeAllowedAt: new Date('2026-01-16T00:00:00.000Z'),
    });
  });

  it('nextChangeAllowedAt is null when lastAliasChangedAt is null (initial grant)', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      alias: 'primer_alias',
      lastAliasChangedAt: null,
    });

    const result = await handler.execute('u-3');

    expect(result.nextChangeAllowedAt).toBeNull();
  });

  it('returns nulls when the user does not exist', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);

    const result = await handler.execute('u-ghost');

    expect(result).toEqual({
      alias: null,
      lastAliasChangedAt: null,
      nextChangeAllowedAt: null,
    });
  });
});
