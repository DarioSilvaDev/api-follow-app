import { ConflictException } from '@nestjs/common';
import { RegisterVehicleHandler } from './register-vehicle.handler';
import { RegisterVehicleCommand } from './register-vehicle.command';
import { VehicleRegisteredEvent } from '../../events/vehicle-registered.event';

describe('RegisterVehicleHandler — F-010 (D-035 / D-036 / D-037)', () => {
  let handler: RegisterVehicleHandler;
  let repositoryMock: {
    findByLicensePlate: jest.Mock;
    create: jest.Mock;
  };
  let eventEmitterMock: { emit: jest.Mock };

  const baseDto = {
    licensePlate: 'abc123',
    vin: undefined,
    engineNumber: undefined,
    versionId: undefined,
    manufactureYear: 2020,
    modelYear: 2021,
    color: undefined,
    notes: undefined,
  };

  beforeEach(() => {
    repositoryMock = {
      findByLicensePlate: jest.fn(),
      create: jest.fn(),
    };
    eventEmitterMock = { emit: jest.fn() };
    handler = new RegisterVehicleHandler(
      repositoryMock as any,
      eventEmitterMock as any,
    );
  });

  it('normalizes licensePlate (trim + uppercase) before checking and creating (D-037)', async () => {
    repositoryMock.findByLicensePlate.mockResolvedValue(null);
    repositoryMock.create.mockResolvedValue({
      id: 'v1',
      licensePlate: 'ABC123',
    });

    const cmd = new RegisterVehicleCommand(
      { ...baseDto, licensePlate: '  abc123  ' },
      'user-1',
    );

    const result = await handler.execute(cmd);

    expect(repositoryMock.findByLicensePlate).toHaveBeenCalledWith('ABC123');
    expect(repositoryMock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        licensePlate: 'ABC123',
        ownerId: 'user-1',
      }),
    );
    expect(result.licensePlate).toBe('ABC123');
  });

  it('throws ConflictException (409) when the normalized plate already exists', async () => {
    repositoryMock.findByLicensePlate.mockResolvedValue({ id: 'v1' });

    const cmd = new RegisterVehicleCommand(
      { ...baseDto, licensePlate: 'abc123' },
      'user-1',
    );

    let caught: any;
    try {
      await handler.execute(cmd);
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(ConflictException);
    expect(caught.getResponse()).toEqual({
      statusCode: 409,
      message: 'Ya existe un vehículo registrado con esa placa',
      error: 'Conflict',
    });
    // El pre-check usa la placa normalizada: "abc123" busca "ABC123".
    expect(repositoryMock.findByLicensePlate).toHaveBeenCalledWith('ABC123');
    expect(repositoryMock.create).not.toHaveBeenCalled();
    expect(eventEmitterMock.emit).not.toHaveBeenCalled();
  });

  it('creates the vehicle for the authenticated owner and emits VehicleRegisteredEvent (D-035)', async () => {
    repositoryMock.findByLicensePlate.mockResolvedValue(null);
    const created = {
      id: 'v1',
      licensePlate: 'ABC123',
      vin: null,
      engineNumber: null,
      versionId: null,
      manufactureYear: null,
      modelYear: null,
      color: null,
      notes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    repositoryMock.create.mockResolvedValue(created);

    const cmd = new RegisterVehicleCommand(baseDto, 'user-1');
    const result = await handler.execute(cmd);

    expect(repositoryMock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        licensePlate: 'ABC123',
        ownerId: 'user-1',
      }),
    );
    expect(eventEmitterMock.emit).toHaveBeenCalledWith(
      'vehicle.registered',
      expect.any(VehicleRegisteredEvent),
    );
    const event = eventEmitterMock.emit.mock.calls[0][1] as VehicleRegisteredEvent;
    expect(event.vehicleId).toBe('v1');
    expect(event.ownerId).toBe('user-1');
    expect(event.licensePlate).toBe('ABC123');
    expect(result).toEqual(created);
  });
});