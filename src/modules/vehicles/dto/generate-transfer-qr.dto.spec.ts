import { validate } from 'class-validator';
import { QrSource } from '@prisma/client';
import { GenerateTransferQrDto } from './generate-transfer-qr.dto';

describe('GenerateTransferQrDto (D-095 / D-085)', () => {
  it('accepts source=presencial', async () => {
    const dto = new GenerateTransferQrDto();
    dto.source = QrSource.presencial;
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('accepts source=concesionaria', async () => {
    const dto = new GenerateTransferQrDto();
    dto.source = QrSource.concesionaria;
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('rejects an invalid source (validation error → 400 via ValidationPipe)', async () => {
    const dto = new GenerateTransferQrDto();
    dto.source = 'otro' as unknown as QrSource;
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('source');
  });

  it('rejects a missing source', async () => {
    const errors = await validate(new GenerateTransferQrDto());
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('source');
  });
});
