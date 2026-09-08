import { HttpStatus } from '@nestjs/common';
import { MileageSource } from '@prisma/client';
import { ERROR_CODES } from '../../../../common/exceptions/error-codes';
import { RecordMileageHandler } from './record-mileage.handler';
import { RecordMileageCommand } from './record-mileage.command';

describe('RecordMileageHandler — monotonic mileage (Security Review #14)', () => {
  let handler: RecordMileageHandler;
  let prismaMock: {
    vehicle: { findUnique: jest.Mock };
    vehicleMileage: { findFirst: jest.Mock; create: jest.Mock };
  };
  let eventEmitterMock: { emit: jest.Mock };

  const baseDto = {
    mileage: 50000,
    source: MileageSource.owner,
    notes: undefined,
  };

  beforeEach(() => {
    prismaMock = {
      vehicle: { findUnique: jest.fn() },
      vehicleMileage: { findFirst: jest.fn(), create: jest.fn() },
    };
    eventEmitterMock = { emit: jest.fn() };
    handler = new RecordMileageHandler(
      prismaMock as any,
      eventEmitterMock as any,
    );
  });

  it('throws 400 VALIDATION_ERROR when new mileage is lower than last recorded', async () => {
    prismaMock.vehicle.findUnique.mockResolvedValue({ id: 'v1' });
    prismaMock.vehicleMileage.findFirst.mockResolvedValue({ mileage: 60000 });

    const cmd = new RecordMileageCommand('v1', { ...baseDto, mileage: 59999 }, 'u1');

    await expect(handler.execute(cmd)).rejects.toMatchObject({
      status: HttpStatus.BAD_REQUEST,
      response: {
        code: ERROR_CODES.VALIDATION_ERROR,
        errors: { mileage: 'km must be greater than or equal to last recorded' },
      },
    });
    expect(prismaMock.vehicleMileage.create).not.toHaveBeenCalled();
  });

  it('allows a mileage equal to the last recorded', async () => {
    prismaMock.vehicle.findUnique.mockResolvedValue({ id: 'v1' });
    prismaMock.vehicleMileage.findFirst.mockResolvedValue({ mileage: 50000 });
    prismaMock.vehicleMileage.create.mockResolvedValue({ id: 'm1', mileage: 50000 });

    const cmd = new RecordMileageCommand('v1', { ...baseDto, mileage: 50000 }, 'u1');
    const result = await handler.execute(cmd);

    expect(prismaMock.vehicleMileage.create).toHaveBeenCalled();
    expect(result).toEqual({ id: 'm1', mileage: 50000 });
    expect(eventEmitterMock.emit).toHaveBeenCalledWith(
      'vehicle.mileage.recorded',
      expect.anything(),
    );
  });

  it('allows a higher mileage', async () => {
    prismaMock.vehicle.findUnique.mockResolvedValue({ id: 'v1' });
    prismaMock.vehicleMileage.findFirst.mockResolvedValue({ mileage: 50000 });
    prismaMock.vehicleMileage.create.mockResolvedValue({ id: 'm1', mileage: 52000 });

    const cmd = new RecordMileageCommand('v1', { ...baseDto, mileage: 52000 }, 'u1');
    const result = await handler.execute(cmd);

    expect(result).toEqual({ id: 'm1', mileage: 52000 });
  });

  it('permits recording when there is no previous record', async () => {
    prismaMock.vehicle.findUnique.mockResolvedValue({ id: 'v1' });
    prismaMock.vehicleMileage.findFirst.mockResolvedValue(null);
    prismaMock.vehicleMileage.create.mockResolvedValue({ id: 'm1', mileage: 50000 });

    const cmd = new RecordMileageCommand('v1', { ...baseDto, mileage: 50000 }, 'u1');
    const result = await handler.execute(cmd);

    expect(result).toEqual({ id: 'm1', mileage: 50000 });
  });

  it('throws NotFoundException when vehicle does not exist', async () => {
    prismaMock.vehicle.findUnique.mockResolvedValue(null);

    const cmd = new RecordMileageCommand('v1', { ...baseDto, mileage: 1 }, 'u1');

    await expect(handler.execute(cmd)).rejects.toThrow();
    expect(prismaMock.vehicleMileage.findFirst).not.toHaveBeenCalled();
  });
});

