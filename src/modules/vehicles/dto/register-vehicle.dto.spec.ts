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
    const result = (await transform({
      licensePlate: 'ABC123',
    })) as RegisterVehicleDto;
    expect(result.vin).toBeUndefined();
  });
});

/**
 * MVP sin versiones: el alta acepta `brandId` + `modelId` (ambos o ninguno).
 * `versionId` ya no forma parte del contrato y el whitelist lo descarta.
 */
describe('RegisterVehicleDto — par brandId/modelId', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: false,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  });

  const transform = (body: Record<string, unknown>): Promise<unknown> =>
    pipe.transform(body, { type: 'body', metatype: RegisterVehicleDto });

  const BRAND_ID = '11111111-1111-4111-8111-111111111111';
  const MODEL_ID = '22222222-2222-4222-8222-222222222222';

  it('acepta brandId + modelId juntos (UUID)', async () => {
    const result = (await transform({
      licensePlate: 'ABC123',
      brandId: BRAND_ID,
      modelId: MODEL_ID,
    })) as RegisterVehicleDto;

    expect(result.brandId).toBe(BRAND_ID);
    expect(result.modelId).toBe(MODEL_ID);
  });

  it('acepta el alta sin marca/modelo (catálogo opcional)', async () => {
    const result = (await transform({
      licensePlate: 'ABC123',
    })) as RegisterVehicleDto;

    expect(result.brandId).toBeUndefined();
    expect(result.modelId).toBeUndefined();
  });

  it('rechaza brandId sin modelId → 400', async () => {
    await expect(
      transform({ licensePlate: 'ABC123', brandId: BRAND_ID }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rechaza modelId sin brandId → 400', async () => {
    await expect(
      transform({ licensePlate: 'ABC123', modelId: MODEL_ID }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rechaza brandId no-UUID → 400', async () => {
    await expect(
      transform({
        licensePlate: 'ABC123',
        brandId: 'not-a-uuid',
        modelId: MODEL_ID,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rechaza modelId no-UUID → 400', async () => {
    await expect(
      transform({
        licensePlate: 'ABC123',
        brandId: BRAND_ID,
        modelId: 'not-a-uuid',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('descarta versionId (ya no se acepta en el alta)', async () => {
    const result = (await transform({
      licensePlate: 'ABC123',
      versionId: '33333333-3333-4333-8333-333333333333',
    })) as RegisterVehicleDto & { versionId?: string };

    expect(result.versionId).toBeUndefined();
  });
});
