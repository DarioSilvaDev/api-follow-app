import { escapeLike } from './escape-like';

describe('escapeLike — comodines de LIKE tratados como texto literal', () => {
  it('escapes backslash', () => {
    expect(escapeLike('a\\b')).toBe('a\\\\b');
  });

  it('escapes percent', () => {
    expect(escapeLike('100%')).toBe('100\\%');
  });

  it('escapes underscore', () => {
    expect(escapeLike('a_b')).toBe('a\\_b');
  });

  it('does not alter plain text', () => {
    expect(escapeLike('taller central')).toBe('taller central');
  });
});
