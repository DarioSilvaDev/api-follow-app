// El polyfill de Reflect Metadata se requiere para los decoradores de
// class-transformer/class-validator en el entorno Jest.
import 'reflect-metadata';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { CheckInDto, OwnerPhoneDto } from './check-in.dto';

/**
 * D-163 — ruta DUAL (JSON + multipart) de POST /care-episodes/check-in.
 *
 * Mismo patrón que `create-owner-care-episode.dto.spec.ts`: `ValidationPipe`
 * real (el global de `main.ts`) para validar los transforms de multipart sin
 * invocar `validate()` a mano.
 */
describe('CheckInDto — ruta dual JSON/multipart (D-163)', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: false,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  });

  const transform = (body: Record<string, unknown>): Promise<unknown> =>
    pipe.transform(body, { type: 'body', metatype: CheckInDto });

  const branchId = '3f2b8c1e-9a4d-4e6b-8f21-0c5d7a9e3b44';
  const serviceTypeId = '9f8e7d6c-5b4a-4c3d-8e2f-1a0b9c8d7e6f';

  const base = {
    licensePlate: 'ABC123',
    branchId,
  };

  it('JSON: conserva number y boolean del contrato histórico', async () => {
    const dto = (await transform({
      ...base,
      mileageIn: 45000,
      mileageInUnreadable: false,
    })) as CheckInDto;

    expect(dto.mileageIn).toBe(45000);
    expect(dto.mileageInUnreadable).toBe(false);
  });

  it('multipart: "false" NO se convierte en true (foot-gun Boolean("false"))', async () => {
    const dto = (await transform({
      ...base,
      mileageIn: '13500',
      mileageInUnreadable: 'false',
    })) as CheckInDto;

    expect(dto.mileageIn).toBe(13500);
    expect(dto.mileageInUnreadable).toBe(false);
  });

  it('multipart: "true" se normaliza a true', async () => {
    const dto = (await transform({
      ...base,
      mileageInUnreadable: 'true',
      mileageInUnreadableReason: 'Tablero roto',
    })) as CheckInDto;

    expect(dto.mileageInUnreadable).toBe(true);
  });

  it('multipart: kilometraje vacío es "no enviado", nunca 0 (D-148)', async () => {
    const dto = (await transform({
      ...base,
      mileageIn: '',
      mileageInUnreadable: 'true',
      mileageInUnreadableReason: 'Tablero roto',
    })) as CheckInDto;

    expect(dto.mileageIn).toBeUndefined();
  });

  it('conserva 0 km como valor real (vehículo 0 km, D-148)', async () => {
    const dto = (await transform({
      ...base,
      mileageIn: 0,
    })) as CheckInDto;

    expect(dto.mileageIn).toBe(0);
  });

  it('multipart: un único serviceTypeIds se normaliza a array', async () => {
    const dto = (await transform({
      ...base,
      mileageIn: '1000',
      serviceTypeIds: serviceTypeId,
    })) as CheckInDto;

    expect(dto.serviceTypeIds).toEqual([serviceTypeId]);
  });

  it('multipart: serviceTypeIds repetido queda como array', async () => {
    const dto = (await transform({
      ...base,
      mileageIn: '1000',
      serviceTypeIds: [serviceTypeId],
    })) as CheckInDto;

    expect(dto.serviceTypeIds).toEqual([serviceTypeId]);
  });

  it('multipart: ownerPhone serializado se hidrata como OwnerPhoneDto', async () => {
    const dto = (await transform({
      ...base,
      mileageIn: '1000',
      ownerPhone: JSON.stringify({
        areaCode: '336',
        nationalNumber: '4687486',
      }),
    })) as CheckInDto;

    expect(dto.ownerPhone).toBeInstanceOf(OwnerPhoneDto);
    expect(dto.ownerPhone).toMatchObject({
      areaCode: '336',
      nationalNumber: '4687486',
    });
  });

  it('multipart: ownerPhone con JSON inválido responde 400', async () => {
    await expect(
      transform({ ...base, mileageIn: '1000', ownerPhone: 'no-es-json' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('multipart: mileageInUnreadable no booleano responde 400', async () => {
    await expect(
      transform({ ...base, mileageInUnreadable: 'yes' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
