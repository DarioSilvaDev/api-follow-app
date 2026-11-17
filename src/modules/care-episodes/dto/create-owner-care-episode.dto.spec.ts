// El polyfill de Reflect Metadata se requiere para los decoradores de
// class-transformer/class-validator en el entorno Jest.
import 'reflect-metadata';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { CreateOwnerCareEpisodeDto } from './create-owner-care-episode.dto';

/**
 * Plan 05 — B-TZ-2 / D-TZ-3: el borde solo acepta `YYYY-MM-DD`.
 *
 * Mismo patrón que `register-vehicle.dto.spec.ts`: `ValidationPipe` real (el
 * global de `main.ts`) para que la aserción no dependa de invocar
 * `validate()` a mano.
 */
describe('CreateOwnerCareEpisodeDto — serviceDate (D-TZ-3)', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: false,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  });

  const transform = (body: Record<string, unknown>): Promise<unknown> =>
    pipe.transform(body, { type: 'body', metatype: CreateOwnerCareEpisodeDto });

  const base = {
    vehicleId: '3f2b8c1e-9a4d-4e6b-8f21-0c5d7a9e3b44',
    title: 'Cambio de aceite',
    workshopName: 'Taller Don Pepe',
  };

  it('acepta una fecha calendario YYYY-MM-DD', async () => {
    const result = (await transform({
      ...base,
      serviceDate: '2026-11-11',
    })) as CreateOwnerCareEpisodeDto;

    expect(result.serviceDate).toBe('2026-11-11');
  });

  it('rechaza un date-time ISO con Z → 400 nombrando el formato', async () => {
    await expect(
      transform({ ...base, serviceDate: '2026-11-11T00:00:00Z' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rechaza un date-time ISO sin offset → 400', async () => {
    await expect(
      transform({ ...base, serviceDate: '2026-11-11T00:00:00' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rechaza el formato local 11/11/2026 → 400', async () => {
    await expect(
      transform({ ...base, serviceDate: '11/11/2026' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('el mensaje de error nombra el formato esperado', async () => {
    await expect(
      transform({ ...base, serviceDate: '2026-11-11T00:00:00Z' }),
    ).rejects.toMatchObject({
      response: {
        message: expect.arrayContaining([
          'serviceDate must be in YYYY-MM-DD format',
        ]),
      },
    });
  });
});
