// El polyfill de Reflect Metadata se requiere para los decoradores de
// class-transformer/class-validator en el entorno Jest.
import 'reflect-metadata';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { RegisterVehicleDto } from './register-vehicle.dto';

/**
 * D-145/D-132: el alta valida el FORMATO del VIN con `IsValidVin`
 * (17 chars, sin I/O/Q). La normalización (trim + uppercase) vive en el
 * handler; por eso un VIN en minúsculas/con espacios es válido en el borde.
 */
describe('RegisterVehicleDto — VIN (D-145/D-132)', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: false,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  });

  const transform = (body: Record<string, unknown>): Promise<unknown> =>
    pipe.transform(body, { type: 'body', metatype: RegisterVehicleDto });

  it('rechaza un VIN inválido (longitud incorrecta) → 400', async () => {
    await expect(
      transform({ licensePlate: 'ABC123', vin: '1HGCM82633A00435' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rechaza un VIN con caracteres prohibidos (I/O/Q) → 400', async () => {
    await expect(
      transform({ licensePlate: 'ABC123', vin: '1HGCM82633A00435I' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('acepta un VIN válido con minúsculas y espacios (se normaliza en el handler)', async () => {
    const result = (await transform({
      licensePlate: 'ABC123',
      vin: '  1hgcm82633a004352  ',
    })) as RegisterVehicleDto;

    expect(result.vin).toBe('  1hgcm82633a004352  ');
  });

  it('acepta el alta sin VIN (opcional)', async () => {
    const result = (await transform({ licensePlate: 'ABC123' })) as RegisterVehicleDto;
    expect(result.vin).toBeUndefined();
  });
});
