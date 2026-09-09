import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaVehicleRepository } from './prisma-vehicle.repository';

describe('PrismaVehicleRepository — P2002 unique violations → 409 and plate normalization (F-010)', () => {
  let repository: PrismaVehicleRepository;
  let prismaMock: {
    vehicle: { create: jest.Mock; findUnique: jest.Mock };
  };

  const registerData = {
    licensePlate: 'ABC123',
    vin: undefined,
    engineNumber: undefined,
    versionId: undefined,
    manufactureYear: undefined,
    modelYear: undefined,
    color: undefined,
    notes: undefined,
    ownerId: 'user-1',
  };

  const p2002 = (target: string[]) =>
    new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: '6.19.3',
      meta: { target },
    });

  beforeEach(() => {
    prismaMock = {
      vehicle: { create: jest.fn(), findUnique: jest.fn() },
    };
    repository = new PrismaVehicleRepository(prismaMock as any);
  });

  const expectConflictWithMessage = async (message: string) => {
    let caught: any;
    try {
      await repository.create(registerData);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ConflictException);
    expect(caught.getResponse()).toEqual({
      statusCode: 409,
      message,
      error: 'Conflict',
    });
  };

  it('maps P2002 on license_plate to a specific 409 (no 500)', async () => {
    prismaMock.vehicle.create.mockRejectedValue(p2002(['license_plate']));
    await expectConflictWithMessage(
      'Ya existe un vehículo registrado con esa placa',
    );
  });

  it('maps P2002 on vin to a specific 409 (no 500)', async () => {
    prismaMock.vehicle.create.mockRejectedValue(p2002(['vin']));
    await expectConflictWithMessage(
      'Ya existe un vehículo registrado con ese VIN',
    );
  });

  it('maps P2002 on engine_number to a specific 409 (no 500)', async () => {
    prismaMock.vehicle.create.mockRejectedValue(p2002(['engine_number']));
    await expectConflictWithMessage(
      'Ya existe un vehículo registrado con ese número de motor',
    );
  });

  it('also handles Prisma field-name targets (licensePlate / engineNumber)', async () => {
    prismaMock.vehicle.create.mockRejectedValue(p2002(['licensePlate']));
    await expectConflictWithMessage(
      'Ya existe un vehículo registrado con esa placa',
    );
  });

  it('rethrows non-P2002 errors as-is', async () => {
    const error = new Error('boom');
    prismaMock.vehicle.create.mockRejectedValue(error);

    await expect(repository.create(registerData)).rejects.toBe(error);
  });

  it('normalizes the plate (trim + uppercase) before findByLicensePlate (D-037)', async () => {
    prismaMock.vehicle.findUnique.mockResolvedValue(null);

    await repository.findByLicensePlate('  aBc123  ');

    expect(prismaMock.vehicle.findUnique).toHaveBeenCalledWith({
      where: { licensePlate: 'ABC123' },
    });
  });
});