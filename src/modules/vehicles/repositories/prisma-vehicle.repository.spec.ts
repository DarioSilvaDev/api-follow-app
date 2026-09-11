import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaVehicleRepository } from './prisma-vehicle.repository';

describe('PrismaVehicleRepository — P2002 → 409, include hydration and plate normalization (F-010 / F-011)', () => {
  let repository: PrismaVehicleRepository;
  let prismaMock: {
    vehicle: { create: jest.Mock; update: jest.Mock; findUnique: jest.Mock };
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

  const updateData = { color: 'Rojo' };

  const p2002 = (target: string[]) =>
    new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: '6.19.3',
      meta: { target },
    });

  beforeEach(() => {
    prismaMock = {
      vehicle: { create: jest.fn(), update: jest.fn(), findUnique: jest.fn() },
    };
    repository = new PrismaVehicleRepository(prismaMock as any);
  });

  const expectConflictWithMessage = async (
    message: string,
    op: () => Promise<unknown>,
  ) => {
    let caught: any;
    try {
      await op();
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
      () => repository.create(registerData),
    );
  });

  it('maps P2002 on vin to a specific 409 (no 500)', async () => {
    prismaMock.vehicle.create.mockRejectedValue(p2002(['vin']));
    await expectConflictWithMessage(
      'Ya existe un vehículo registrado con ese VIN',
      () => repository.create(registerData),
    );
  });

  it('maps P2002 on engine_number to a specific 409 (no 500)', async () => {
    prismaMock.vehicle.create.mockRejectedValue(p2002(['engine_number']));
    await expectConflictWithMessage(
      'Ya existe un vehículo registrado con ese número de motor',
      () => repository.create(registerData),
    );
  });

  it('also handles Prisma field-name targets (licensePlate / engineNumber)', async () => {
    prismaMock.vehicle.create.mockRejectedValue(p2002(['licensePlate']));
    await expectConflictWithMessage(
      'Ya existe un vehículo registrado con esa placa',
      () => repository.create(registerData),
    );
  });

  it('rethrows non-P2002 errors as-is', async () => {
    const error = new Error('boom');
    prismaMock.vehicle.create.mockRejectedValue(error);

    await expect(repository.create(registerData)).rejects.toBe(error);
  });

  it('hydrates version.model.brand via include on create (F-010 §10)', async () => {
    prismaMock.vehicle.create.mockResolvedValue({
      id: 'v1',
      licensePlate: 'ABC123',
      version: {
        id: 'version-1',
        name: '1.6 LX',
        model: {
          id: 'model-1',
          name: 'Civic',
          brand: { id: 'brand-1', name: 'Honda' },
        },
      },
    });

    await repository.create({ ...registerData, versionId: 'version-1' });

    expect(prismaMock.vehicle.create).toHaveBeenCalledWith(
      expect.objectContaining({
        include: {
          version: {
            include: {
              model: {
                include: { brand: true },
              },
            },
          },
        },
      }),
    );
  });

  it('normalizes the plate (trim + uppercase) before findByLicensePlate (D-037)', async () => {
    prismaMock.vehicle.findUnique.mockResolvedValue(null);

    await repository.findByLicensePlate('  aBc123  ');

    expect(prismaMock.vehicle.findUnique).toHaveBeenCalledWith({
      where: { licensePlate: 'ABC123' },
    });
  });

  // ── update() (F-011: D-041 / D-042) ─────────────────────────────────────

  it('hydrates version.model.brand via include on update (F-011 / F-010 §10)', async () => {
    prismaMock.vehicle.update.mockResolvedValue({
      id: 'v1',
      licensePlate: 'ABC123',
      version: {
        id: 'version-1',
        name: '1.6 LX',
        model: {
          id: 'model-1',
          name: 'Civic',
          brand: { id: 'brand-1', name: 'Honda' },
        },
      },
    });

    await repository.update('v1', updateData);

    expect(prismaMock.vehicle.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'v1' },
        data: { color: 'Rojo' },
        include: {
          version: {
            include: {
              model: {
                include: { brand: true },
              },
            },
          },
        },
      }),
    );
  });

  it('maps P2002 on license_plate to a specific 409 on update (D-041)', async () => {
    prismaMock.vehicle.update.mockRejectedValue(p2002(['license_plate']));
    await expectConflictWithMessage(
      'Ya existe un vehículo registrado con esa placa',
      () => repository.update('v1', updateData),
    );
  });

  it('maps P2002 on vin to a specific 409 on update (D-041)', async () => {
    prismaMock.vehicle.update.mockRejectedValue(p2002(['vin']));
    await expectConflictWithMessage(
      'Ya existe un vehículo registrado con ese VIN',
      () => repository.update('v1', updateData),
    );
  });

  it('maps P2002 on engine_number to a specific 409 on update (D-041)', async () => {
    prismaMock.vehicle.update.mockRejectedValue(p2002(['engine_number']));
    await expectConflictWithMessage(
      'Ya existe un vehículo registrado con ese número de motor',
      () => repository.update('v1', updateData),
    );
  });

  it('also handles Prisma field-name targets on update (licensePlate / engineNumber)', async () => {
    prismaMock.vehicle.update.mockRejectedValue(p2002(['licensePlate']));
    await expectConflictWithMessage(
      'Ya existe un vehículo registrado con esa placa',
      () => repository.update('v1', updateData),
    );
  });

  it('rethrows non-P2002 errors as-is on update', async () => {
    const error = new Error('boom');
    prismaMock.vehicle.update.mockRejectedValue(error);

    await expect(repository.update('v1', updateData)).rejects.toBe(error);
  });

  it('normalizes the plate (trim + uppercase) on update as a safety net (D-042)', async () => {
    prismaMock.vehicle.update.mockResolvedValue({
      id: 'v1',
      licensePlate: 'ABC123',
    });

    await repository.update('v1', { licensePlate: '  aBc123  ', ...updateData });

    expect(prismaMock.vehicle.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { licensePlate: 'ABC123', color: 'Rojo' },
      }),
    );
  });

  it('does not touch licensePlate on update when it is not provided (D-040)', async () => {
    prismaMock.vehicle.update.mockResolvedValue({ id: 'v1' });

    await repository.update('v1', updateData);

    expect(prismaMock.vehicle.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { color: 'Rojo' },
      }),
    );
  });

  // ── D-043: null explícito vacía campo opcional ─────────────────────────

  it('passes explicit null to Prisma for nullable fields (D-043)', async () => {
    prismaMock.vehicle.update.mockResolvedValue({
      id: 'v1',
      licensePlate: 'ABC123',
      color: null,
    });

    await repository.update('v1', { color: null });

    expect(prismaMock.vehicle.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { color: null },
      }),
    );
  });

  it('passes multiple null fields to Prisma without converting them (D-043)', async () => {
    prismaMock.vehicle.update.mockResolvedValue({
      id: 'v1',
      licensePlate: 'ABC123',
      vin: null,
      engineNumber: null,
      notes: null,
    });

    await repository.update('v1', {
      vin: null,
      engineNumber: null,
      notes: null,
    });

    expect(prismaMock.vehicle.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { vin: null, engineNumber: null, notes: null },
      }),
    );
  });
});