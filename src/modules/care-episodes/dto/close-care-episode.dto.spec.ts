// D-207 — el cierre exige diagnóstico / resumen de la atención.
import 'reflect-metadata';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { CloseCareEpisodeDto } from './close-care-episode.dto';

describe('CloseCareEpisodeDto — resumen obligatorio (D-207)', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    transform: true,
  });

  const transform = (body: Record<string, unknown>): Promise<unknown> =>
    pipe.transform(body, { type: 'body', metatype: CloseCareEpisodeDto });

  const base = { mileageOut: 45500 };

  it('acepta y recorta un resumen válido', async () => {
    const dto = (await transform({
      ...base,
      closeNotes: '  Cambio de aceite y filtro  ',
    })) as CloseCareEpisodeDto;

    expect(dto.closeNotes).toBe('Cambio de aceite y filtro');
  });

  it('rechaza el cierre sin closeNotes', async () => {
    await expect(transform(base)).rejects.toThrow(BadRequestException);
  });

  it('rechaza un resumen de menos de 10 caracteres', async () => {
    await expect(
      transform({ ...base, closeNotes: 'aceite' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rechaza un resumen de más de 1000 caracteres', async () => {
    await expect(
      transform({ ...base, closeNotes: 'x'.repeat(1001) }),
    ).rejects.toThrow(BadRequestException);
  });
});
