import { NotFoundException } from '../../../../common/exceptions/not-found.exception';
import { LookupVehicleHandler } from './lookup-vehicle.handler';

describe('LookupVehicleHandler — plate lookup for workshop check-in (F-020)', () => {
  let handler: LookupVehicleHandler;
  let prismaMock: {
    vehicle: { findUnique: jest.Mock };
  };

  const vehicleRecord = {
    id: 'v-1',
    licensePlate: 'ABC123',
    manufactureYear: 2019,
    modelYear: 2020,
    version: {
      name: 'Limited 2.0 Sport',
      model: {
        name: 'Corolla',
        brand: { name: 'Toyota' },
      },
    },
  };

  beforeEach(() => {
    prismaMock = { vehicle: { findUnique: jest.fn() } };
    handler = new LookupVehicleHandler(prismaMock as any);
  });

  it('normalizes the plate (trim + uppercase) before querying (D-037/D-042)', async () => {
    prismaMock.vehicle.findUnique.mockResolvedValue(vehicleRecord);

    const result = await handler.execute('  abc123  ');

    expect(prismaMock.vehicle.findUnique).toHaveBeenCalledWith({
      where: { licensePlate: 'ABC123' },
      select: expect.any(Object),
    });
    expect(result.licensePlate).toBe('ABC123');
  });

  it('returns the minimal check-in fields (no VIN, no engineNumber, no owner PII)', async () => {
    const fullRecord = {
      ...vehicleRecord,
      vin: 'VIN-SENSITIVE',
      engineNumber: 'ENG-SENSITIVE',
      owner: { firstName: 'John', lastName: 'Doe' },
    };
    prismaMock.vehicle.findUnique.mockResolvedValue(fullRecord);

    const result = await handler.execute('ABC123');

    expect(result).toEqual({
      id: 'v-1',
      licensePlate: 'ABC123',
      brand: 'Toyota',
      model: 'Corolla',
      version: 'Limited 2.0 Sport',
      manufactureYear: 2019,
      modelYear: 2020,
    });
    expect(result).not.toHaveProperty('vin');
    expect(result).not.toHaveProperty('engineNumber');
    expect(result).not.toHaveProperty('owner');
  });

  it('returns null brand/model/version when the vehicle has no catalog version', async () => {
    prismaMock.vehicle.findUnique.mockResolvedValue({
      ...vehicleRecord,
      version: null,
    });

    const result = await handler.execute('ABC123');

    expect(result).toEqual({
      id: 'v-1',
      licensePlate: 'ABC123',
      brand: null,
      model: null,
      version: null,
      manufactureYear: 2019,
      modelYear: 2020,
    });
  });

  it('rejects with 404 when the plate is not registered', async () => {
    prismaMock.vehicle.findUnique.mockResolvedValue(null);

    await expect(handler.execute('ZZZ999')).rejects.toThrow(NotFoundException);
  });
});
