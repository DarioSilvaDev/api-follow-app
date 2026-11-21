import { shouldIgnoreHealth } from './ignore-health';

describe('shouldIgnoreHealth', () => {
  it.each([
    ['/api/health', true],
    ['/api/health?foo=bar', true],
    ['/api/health/ready', true],
    ['/api/healthcheck', true],
    ['/api/auth/login', false],
    ['/api', false],
    ['', false],
  ])('para %s devuelve %s', (url, expected) => {
    expect(shouldIgnoreHealth({ url } as any)).toBe(expected);
  });

  it('no explota sin url', () => {
    expect(shouldIgnoreHealth({} as any)).toBe(false);
  });
});
