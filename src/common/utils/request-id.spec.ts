import { resolveRequestId } from './request-id';

describe('resolveRequestId', () => {
  it('adopta un x-request-id válido', () => {
    const req = { headers: { 'x-request-id': 'cliente-123456' } };

    expect(resolveRequestId(req)).toBe('cliente-123456');
  });

  it('acepta el primer valor cuando el header llega repetido', () => {
    const req = {
      headers: { 'x-request-id': ['primero-123', 'segundo-456'] },
    };

    expect(resolveRequestId(req)).toBe('primero-123');
  });

  it.each([
    ['corto', 'abc'],
    ['caracteres inválidos', 'cliente con espacios'],
    ['empieza con guion', '-cliente-123'],
    ['vacío', ''],
  ])('descarta un header %s y genera un UUID v4', (_label, value) => {
    const req = { headers: { 'x-request-id': value } };

    const id = resolveRequestId(req);

    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(id).not.toBe(value);
  });

  it('genera un UUID v4 cuando no hay header', () => {
    const id = resolveRequestId({ headers: {} });

    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it('reutiliza el mismo ID para el mismo request aunque cambie el header', () => {
    const req = { headers: { 'x-request-id': 'cliente-123456' } };

    const first = resolveRequestId(req);
    req.headers['x-request-id'] = 'otro-999999';
    const second = resolveRequestId(req);

    expect(second).toBe(first);
  });

  it('genera IDs distintos para requests distintos', () => {
    const first = resolveRequestId({ headers: {} });
    const second = resolveRequestId({ headers: {} });

    expect(second).not.toBe(first);
  });

  it('no explota con un request sin headers', () => {
    expect(typeof resolveRequestId({})).toBe('string');
    expect(typeof resolveRequestId(undefined)).toBe('string');
  });
});
