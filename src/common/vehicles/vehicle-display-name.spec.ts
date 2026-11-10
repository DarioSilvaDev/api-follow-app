import { resolveVehicleDisplayName } from './vehicle-display-name';

describe('resolveVehicleDisplayName', () => {
  it('usa marca y modelo de la versión de catálogo', () => {
    expect(
      resolveVehicleDisplayName({
        version: {
          model: { name: 'Corolla', brand: { name: 'Toyota' } },
        },
        brandName: 'Ignorada',
        modelName: 'Ignorado',
        licensePlate: 'ABC123',
      }),
    ).toBe('Toyota Corolla');
  });

  it('la versión de catálogo gana sobre el texto libre', () => {
    expect(
      resolveVehicleDisplayName({
        version: { model: { name: 'Hilux', brand: { name: 'Toyota' } } },
        brandName: 'Otra marca',
        modelName: 'Otro modelo',
      }),
    ).toBe('Toyota Hilux');
  });

  it('con sólo la marca de catálogo devuelve la marca', () => {
    expect(
      resolveVehicleDisplayName({
        version: { model: { name: null, brand: { name: 'Ford' } } },
        brandName: 'Otra marca',
      }),
    ).toBe('Ford');
  });

  it('cae a texto libre cuando no hay versión', () => {
    expect(
      resolveVehicleDisplayName({
        brandName: 'Volkswagen',
        modelName: 'Gol',
        licensePlate: 'ABC123',
      }),
    ).toBe('Volkswagen Gol');
  });

  it('acepta marca sola en texto libre', () => {
    expect(resolveVehicleDisplayName({ brandName: 'Fiat' })).toBe('Fiat');
  });

  it('acepta modelo solo en texto libre', () => {
    expect(resolveVehicleDisplayName({ modelName: 'Partner' })).toBe('Partner');
  });

  it('cae a la patente cuando no hay marca ni modelo', () => {
    expect(resolveVehicleDisplayName({ licensePlate: 'AB123CD' })).toBe(
      'AB123CD',
    );
  });

  it('ignora strings vacíos o con espacios', () => {
    expect(
      resolveVehicleDisplayName({
        version: { model: { name: '   ', brand: { name: '' } } },
        brandName: '  ',
        modelName: ' ',
        licensePlate: 'AB123CD',
      }),
    ).toBe('AB123CD');
  });

  it('devuelve cadena vacía si no hay ningún dato', () => {
    expect(resolveVehicleDisplayName({})).toBe('');
    expect(
      resolveVehicleDisplayName({ brandName: null, modelName: null }),
    ).toBe('');
  });

  it('nunca devuelve "null" ni "undefined"', () => {
    const result = resolveVehicleDisplayName({
      version: null,
      brandName: null,
      modelName: undefined,
      licensePlate: null,
    });
    expect(result).toBe('');
    expect(result).not.toContain('null');
    expect(result).not.toContain('undefined');
  });
});
