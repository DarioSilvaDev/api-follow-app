import { VehicleResponseDto } from './vehicle-response.dto';

describe('VehicleResponseDto.from — F-010 §10 (brand/model/version)', () => {
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
  };

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

    const dto = VehicleResponseDto.from(vehicle as any);

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

    const dto = VehicleResponseDto.from(vehicle as any);

    expect(dto.brand).toBeNull();
    expect(dto.model).toBeNull();
    expect(dto.version).toBeNull();
    expect(dto.versionId).toBeNull();
  });
});