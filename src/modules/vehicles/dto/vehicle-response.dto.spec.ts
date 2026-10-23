import { VehicleResponseDto } from './vehicle-response.dto';

describe('VehicleResponseDto.from', () => {
  const baseVehicle = {
    id: 'v1',
    licensePlate: 'ABC123',
    vin: null,
    engineNumber: null,
    manufactureYear: null,
    modelYear: null,
    color: null,
    notes: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  } as any;

  it('maps brand/model/version names when version.model.brand is populated', () => {
    const vehicle = {
      ...baseVehicle,
      versionId: 'version-1',
      version: {
        id: 'version-1',
        name: '1.6 LX',
        model: {
          id: 'model-1',
          name: 'Civic',
          brand: { id: 'brand-1', name: 'Honda' },
        },
      },
    };

    const dto = VehicleResponseDto.from(vehicle);

    expect(dto.brandId).toBe('brand-1');
    expect(dto.modelId).toBe('model-1');
    expect(dto.brand).toBe('Honda');
    expect(dto.model).toBe('Civic');
    expect(dto.version).toBe('1.6 LX');
    expect(dto.versionId).toBe('version-1');
  });

  it('returns brand/model/version as null when the vehicle has no version (versionId null)', () => {
    const vehicle = {
      ...baseVehicle,
      versionId: null,
    };

    const dto = VehicleResponseDto.from(vehicle);

    expect(dto.brandId).toBeNull();
    expect(dto.modelId).toBeNull();
    expect(dto.brand).toBeNull();
    expect(dto.model).toBeNull();
    expect(dto.version).toBeNull();
    expect(dto.versionId).toBeNull();
  });

  it('includes mileages, mileageCount and normalizes recordedBy per kind', () => {
    const vehicle = {
      ...baseVehicle,
      mileages: [
        {
          id: 'm1',
          vehicleId: 'v1',
          mileage: 10000,
          source: 'owner',
          recordedAt: new Date('2026-01-10T00:00:00.000Z'),
          notes: null,
          recordedByUserId: 'u1',
          recordedByDealershipId: null,
          recordedByDealershipMemberId: null,
          recordedByWorkshopMemberId: null,
          recordedByUser: { id: 'u1', firstName: 'Ana', lastName: 'Gomez' },
        },
        {
          id: 'm2',
          vehicleId: 'v1',
          mileage: 15000,
          source: 'dealership',
          recordedAt: new Date('2026-02-10T00:00:00.000Z'),
          notes: 'service',
          recordedByUserId: 'u2',
          recordedByDealershipId: 'd1',
          recordedByDealershipMemberId: 'dm1',
          recordedByWorkshopMemberId: null,
          recordedByDealership: { id: 'd1', name: 'Concesionaria X' },
        },
      ],
      mileageCount: 2,
      capabilities: { canEdit: true, canRecordMileage: true, canCorrectVin: false },
    } as any;

    const dto = VehicleResponseDto.from(vehicle);

    expect(dto.mileageCount).toBe(2);
    expect(dto.mileages?.length).toBe(2);
    expect(dto.mileages?.[0].recordedBy).toEqual({ kind: 'user', id: 'u1', displayName: 'Ana Gomez' });
    expect(dto.mileages?.[1].recordedBy).toEqual({ kind: 'dealership', id: 'd1', displayName: 'Concesionaria X' });
    expect(dto.capabilities).toEqual({ canEdit: true, canRecordMileage: true, canCorrectVin: false });
  });
});
