// El polyfill de Reflect Metadata se requiere para los decoradores de
// class-transformer/class-validator en el entorno Jest.
import 'reflect-metadata';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { CorrectVinDto } from './correct-vin.dto';

/**
 * Security B5: `reason` se sanea en el borde HTTP — trim antes de validar,
 * rechazo de sólo-espacios y límite de longitud — para que el handler persista
 * ya el valor saneado (auditoría D-144).
 */
describe('CorrectVinDto — saneo de reason (Security B5)', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: false,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  });

  const transform = (body: Record<string, unknown>): Promise<unknown> =>
    pipe.transform(body, { type: 'body', metatype: CorrectVinDto });

  const validVin = '1HGCM82633A004352';

  it('hace trim del reason antes de validar/persistir', async () => {
    const result = (await transform({
      vin: validVin,
      reason: '   VIN mal tipeado en el alta   ',
    })) as CorrectVinDto;

    expect(result.reason).toBe('VIN mal tipeado en el alta');
  });

  it('rechaza un reason de sólo espacios → 400', async () => {
    await expect(
      transform({ vin: validVin, reason: '        ' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rechaza un reason vacío → 400', async () => {
    await expect(
      transform({ vin: validVin, reason: '' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rechaza un reason mayor a 500 caracteres → 400', async () => {
    await expect(
      transform({ vin: validVin, reason: 'x'.repeat(501) }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('acepta un reason de exactamente 500 caracteres', async () => {
    const result = (await transform({
      vin: validVin,
      reason: 'x'.repeat(500),
    })) as CorrectVinDto;

    expect(result.reason.length).toBe(500);
  });
});
