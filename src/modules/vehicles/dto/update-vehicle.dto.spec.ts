// El polyfill de Reflect Metadata se requiere para los decoradores de
// class-transformer/class-validator en el entorno Jest.
import 'reflect-metadata';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { UpdateVehicleDto } from './update-vehicle.dto';

/**
 * Defecto funcional (whitelist): `UpdateVehicleDto` declaraba los campos
 * editables SIN decoradores. Con el ValidationPipe global
 * (`whitelist: true`, src/main.ts) esas propiedades eran descartadas y el PATCH
 * quedaba no-op. Este test ejecuta el ValidationPipe REAL para que la regresión
 * se detecte: si algún campo editable pierde su decorador, el whitelist lo
 * elimina y el test falla.
 */
describe('UpdateVehicleDto — whitelist del PATCH (regresión)', () => {
  // Mismas opciones que el pipe global de src/main.ts.
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: false,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  });

  const transform = (body: Record<string, unknown>): Promise<unknown> =>
    pipe.transform(body, { type: 'body', metatype: UpdateVehicleDto });

  it('conserva TODOS los campos editables tras el whitelist', async () => {
    const body = {
      licensePlate: 'ABC123',
      color: 'Rojo',
      notes: 'Detalle del vehículo',
      manufactureYear: 2019,
      modelYear: 2020,
      engineNumber: 'ENG-001',
      versionId: '11111111-1111-4111-8111-111111111111',
    };

    const result = (await transform(body)) as UpdateVehicleDto;

    expect(result).toMatchObject({
      licensePlate: 'ABC123',
      color: 'Rojo',
      notes: 'Detalle del vehículo',
      manufactureYear: 2019,
      modelYear: 2020,
      engineNumber: 'ENG-001',
      versionId: '11111111-1111-4111-8111-111111111111',
    });
    // Cada propiedad demostrablemente sobrevivió al whitelist.
    expect(Object.keys(result)).toEqual(
      expect.arrayContaining([
        'licensePlate',
        'color',
        'notes',
        'manufactureYear',
        'modelYear',
        'engineNumber',
        'versionId',
      ]),
    );
  });

  it('vin → 400 (no se descarta en silencio; la corrección es flujo aparte)', async () => {
    await expect(
      transform({ vin: '1HGCM82633A004352' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('licensePlate inválida → 400 (mismo contrato que el alta, D-037)', async () => {
    await expect(transform({ licensePlate: 'a' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('manufactureYear fuera de rango → 400', async () => {
    await expect(transform({ manufactureYear: 1800 })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('versionId no-UUID → 400', async () => {
    await expect(transform({ versionId: 'not-a-uuid' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
