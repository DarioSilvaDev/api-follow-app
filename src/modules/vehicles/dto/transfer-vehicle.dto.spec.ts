// El polyfill de Reflect Metadata se requiere para los decoradores de
// class-transformer/class-validator (@Type) en el entorno Jest.
import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate, ValidationError } from 'class-validator';
import { TransferVehicleDto } from './transfer-vehicle.dto';

/** Aplana los errores anidados (recipient → children → ...) para assert simples. */
function collectErrors(errors: ValidationError[]): ValidationError[] {
  const flat: ValidationError[] = [];
  const walk = (list: ValidationError[]) => {
    for (const e of list) {
      flat.push(e);
      if (e.children?.length) walk(e.children);
    }
  };
  walk(errors);
  return flat;
}

const hasErrorOn = (errors: ValidationError[], property: string) =>
  collectErrors(errors).some((e) => e.property === property);

describe('TransferVehicleDto — recipient email|alias (contrato PM)', () => {
  // plainToInstance reproduce el comportamiento del ValidationPipe global
  // (transform: true + @Type en recipient).
  const validateBody = (body: Record<string, unknown>) =>
    validate(plainToInstance(TransferVehicleDto, body));

  it('acepta recipient por email con notes', async () => {
    const errors = await validateBody({
      recipient: { type: 'email', value: 'destino@example.com' },
      notes: 'Hola',
    });
    expect(errors).toHaveLength(0);
  });

  it('acepta recipient por email sin notes (notes opcional)', async () => {
    const errors = await validateBody({
      recipient: { type: 'email', value: 'destino@example.com' },
    });
    expect(errors).toHaveLength(0);
  });

  it('acepta recipient por alias con mayúsculas (regex con a-z A-Z)', async () => {
    const errors = await validateBody({
      recipient: { type: 'alias', value: 'Juan-9' },
    });
    expect(errors).toHaveLength(0);
  });

  it('rechaza type inválido ("phone")', async () => {
    const errors = await validateBody({
      recipient: { type: 'phone', value: '123' },
    });
    expect(hasErrorOn(errors, 'type')).toBe(true);
  });

  it('rechaza recipient ausente', async () => {
    const errors = await validateBody({ notes: 'sin destinatario' });
    expect(hasErrorOn(errors, 'recipient')).toBe(true);
  });

  it('rechaza type ausente dentro de recipient', async () => {
    const errors = await validateBody({ recipient: { value: 'x@y.com' } });
    expect(hasErrorOn(errors, 'type')).toBe(true);
  });

  it('rechaza value vacío con type email', async () => {
    const errors = await validateBody({
      recipient: { type: 'email', value: '' },
    });
    expect(hasErrorOn(errors, 'value')).toBe(true);
  });

  it('rechaza email malformado con type email', async () => {
    const errors = await validateBody({
      recipient: { type: 'email', value: 'no-es-un-email' },
    });
    expect(hasErrorOn(errors, 'value')).toBe(true);
  });

  it('rechaza alias fuera de la regex con type alias', async () => {
    const errors = await validateBody({
      recipient: { type: 'alias', value: '@bad@alias' },
    });
    expect(hasErrorOn(errors, 'value')).toBe(true);
  });

  it('rechaza alias demasiado corto con type alias', async () => {
    const errors = await validateBody({
      recipient: { type: 'alias', value: 'ab' },
    });
    expect(hasErrorOn(errors, 'value')).toBe(true);
  });

  it('rechaza notes que no es string', async () => {
    const errors = await validateBody({
      recipient: { type: 'email', value: 'destino@example.com' },
      notes: 123,
    });
    expect(hasErrorOn(errors, 'notes')).toBe(true);
  });
});
