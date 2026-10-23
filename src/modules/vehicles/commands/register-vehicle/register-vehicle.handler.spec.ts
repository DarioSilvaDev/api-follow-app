import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { RegisterVehicleHandler } from './register-vehicle.handler';
import { RegisterVehicleCommand } from './register-vehicle.command';
import { VehicleRegisteredEvent } from '../../events/vehicle-registered.event';
import {
  DealershipContext,
  PersonalContext,
  PlatformContext,
  WorkshopContext,
} from '../../../../common/context/interfaces/current-context.interface';

describe('RegisterVehicleHandler — F-010 (D-035 / D-036 / D-037) + Gap 1 (D-128)', () => {
  let handler: RegisterVehicleHandler;
  let repositoryMock: {
    findByLicensePlate: jest.Mock;
    create: jest.Mock;
    createDealershipRegistration: jest.Mock;
  };
  let eventEmitterMock: { emit: jest.Mock };
  let prismaMock: { dealershipMember: { findUnique: jest.Mock } };

  const baseDto = {
    licensePlate: 'abc123',
    vin: undefined,
    engineNumber: undefined,
    versionId: undefined,
    manufactureYear: 2020,
    modelYear: 2021,
    color: undefined,
    notes: undefined,
    initialMileage: undefined,
  };

  const personalCtx: PersonalContext = { type: 'PERSONAL', userId: 'user-1' };
  const dealershipCtx: DealershipContext = {
    type: 'DEALERSHIP',
    userId: 'user-1',
    dealershipId: 'deal-1',
    memberId: 'member-1',
    roleId: 'role-1',
  };
  const workshopCtx: WorkshopContext = {
    type: 'WORKSHOP',
    userId: 'user-1',
    workshopId: 'shop-1',
    memberId: 'wm-1',
    roleId: 'wr-1',
  };
  const platformCtx: PlatformContext = { type: 'PLATFORM', userId: 'user-1' };

  const activeMemberWithCreate = {
    status: 'active',
    role: {
      permissions: [{ permission: { code: 'dealership.vehicle.create' } }],
    },
    dealership: { isActive: true },
  };

  beforeEach(() => {
    repositoryMock = {
      findByLicensePlate: jest.fn(),
      create: jest.fn(),
      createDealershipRegistration: jest.fn(),
    };
    eventEmitterMock = { emit: jest.fn() };
    prismaMock = { dealershipMember: { findUnique: jest.fn() } };
    handler = new RegisterVehicleHandler(
      repositoryMock as any,
      eventEmitterMock as any,
      prismaMock as any,
    );
  });

  // ────────────────────────────────────────────────────────────
  // PERSONAL — comportamiento existente (F-010)
  // ────────────────────────────────────────────────────────────

  it('normalizes licensePlate (trim + uppercase) before checking and creating (D-037)', async () => {
    repositoryMock.findByLicensePlate.mockResolvedValue(null);
    repositoryMock.create.mockResolvedValue({
      id: 'v1',
      licensePlate: 'ABC123',
    });

    const cmd = new RegisterVehicleCommand(
      { ...baseDto, licensePlate: '  abc123  ' },
      'user-1',
      personalCtx,
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

  it('normalizes vin (trim + uppercase) before persisting (D-145/D-132)', async () => {
    repositoryMock.findByLicensePlate.mockResolvedValue(null);
    repositoryMock.create.mockResolvedValue({
      id: 'v1',
      licensePlate: 'ABC123',
      vin: '1HGCM82633A004352',
    });

    const cmd = new RegisterVehicleCommand(
      { ...baseDto, vin: '  1hgcm82633a004352  ' },
      'user-1',
      personalCtx,
    );

    await handler.execute(cmd);

    expect(repositoryMock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        vin: '1HGCM82633A004352',
        licensePlate: 'ABC123',
        ownerId: 'user-1',
      }),
    );
  });

  it('normalizes vin for DEALERSHIP registration too (D-145/D-132)', async () => {
    prismaMock.dealershipMember.findUnique.mockResolvedValue(
      activeMemberWithCreate,
    );
    repositoryMock.findByLicensePlate.mockResolvedValue(null);
    repositoryMock.createDealershipRegistration.mockResolvedValue({
      id: 'v-dealer',
      licensePlate: 'ABC123',
    });

    const cmd = new RegisterVehicleCommand(
      { ...baseDto, vin: '  1hgcm82633a004352  ', initialMileage: 0 },
      'user-1',
      dealershipCtx,
    );

    await handler.execute(cmd);

    expect(
      repositoryMock.createDealershipRegistration,
    ).toHaveBeenCalledWith(
      expect.objectContaining({ vin: '1HGCM82633A004352' }),
    );
  });

  it('throws ConflictException (409) when the normalized plate already exists', async () => {
    repositoryMock.findByLicensePlate.mockResolvedValue({ id: 'v1' });

    const cmd = new RegisterVehicleCommand(
      { ...baseDto, licensePlate: 'abc123' },
      'user-1',
      personalCtx,
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

    const cmd = new RegisterVehicleCommand(baseDto, 'user-1', personalCtx);
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
    const event = eventEmitterMock.emit.mock
      .calls[0][1] as VehicleRegisteredEvent;
    expect(event.vehicleId).toBe('v1');
    expect(event.ownerId).toBe('user-1');
    expect(event.licensePlate).toBe('ABC123');
    expect(result).toEqual(created);
  });

  it('rejects initialMileage on a PERSONAL registration with 400 (D-07)', async () => {
    const cmd = new RegisterVehicleCommand(
      { ...baseDto, initialMileage: 10 },
      'user-1',
      personalCtx,
    );

    await expect(handler.execute(cmd)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(repositoryMock.findByLicensePlate).not.toHaveBeenCalled();
    expect(repositoryMock.create).not.toHaveBeenCalled();
  });

  // ────────────────────────────────────────────────────────────
  // DEALERSHIP — Gap 1 (D-128)
  // ────────────────────────────────────────────────────────────

  it('creates dealership stock: company ownership + initial mileage attribution, then emits the event', async () => {
    prismaMock.dealershipMember.findUnique.mockResolvedValue(
      activeMemberWithCreate,
    );
    repositoryMock.findByLicensePlate.mockResolvedValue(null);
    const created = {
      id: 'v-dealer',
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
    repositoryMock.createDealershipRegistration.mockResolvedValue(created);

    const cmd = new RegisterVehicleCommand(
      { ...baseDto, initialMileage: 0 },
      'user-1',
      dealershipCtx,
    );
    const result = await handler.execute(cmd);

    // El repositorio recibe el contexto que autoriza y atribuye el kilometraje.
    expect(repositoryMock.createDealershipRegistration).toHaveBeenCalledWith(
      expect.objectContaining({
        licensePlate: 'ABC123',
        dealershipId: 'deal-1',
        dealershipMemberId: 'member-1',
        recordedByUserId: 'user-1',
        initialMileage: 0,
      }),
    );
    // No se usa la rama personal.
    expect(repositoryMock.create).not.toHaveBeenCalled();
    expect(eventEmitterMock.emit).toHaveBeenCalledWith(
      'vehicle.registered',
      expect.any(VehicleRegisteredEvent),
    );
    expect(result).toEqual(created);
  });

  it('rejects a DEALERSHIP registration without initialMileage with 400 (D-07)', async () => {
    const cmd = new RegisterVehicleCommand(baseDto, 'user-1', dealershipCtx);

    await expect(handler.execute(cmd)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    // Falla antes de resolver membresía o tocar persistencia.
    expect(prismaMock.dealershipMember.findUnique).not.toHaveBeenCalled();
    expect(repositoryMock.createDealershipRegistration).not.toHaveBeenCalled();
    expect(eventEmitterMock.emit).not.toHaveBeenCalled();
  });

  it('forbids a DEALERSHIP member whose role lacks dealership.vehicle.create (403)', async () => {
    prismaMock.dealershipMember.findUnique.mockResolvedValue({
      status: 'active',
      role: { permissions: [{ permission: { code: 'history.view' } }] },
      dealership: { isActive: true },
    });

    const cmd = new RegisterVehicleCommand(
      { ...baseDto, initialMileage: 5 },
      'user-1',
      dealershipCtx,
    );

    await expect(handler.execute(cmd)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(repositoryMock.createDealershipRegistration).not.toHaveBeenCalled();
    expect(eventEmitterMock.emit).not.toHaveBeenCalled();
  });

  it('forbids an inactive DEALERSHIP membership (403)', async () => {
    prismaMock.dealershipMember.findUnique.mockResolvedValue({
      status: 'suspended',
      role: {
        permissions: [{ permission: { code: 'dealership.vehicle.create' } }],
      },
      dealership: { isActive: true },
    });

    const cmd = new RegisterVehicleCommand(
      { ...baseDto, initialMileage: 5 },
      'user-1',
      dealershipCtx,
    );

    await expect(handler.execute(cmd)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(repositoryMock.createDealershipRegistration).not.toHaveBeenCalled();
  });

  it('propagates a persistence failure (e.g. audit insert) and does NOT emit the event (atomic rollback)', async () => {
    prismaMock.dealershipMember.findUnique.mockResolvedValue(
      activeMemberWithCreate,
    );
    repositoryMock.findByLicensePlate.mockResolvedValue(null);
    repositoryMock.createDealershipRegistration.mockRejectedValue(
      new Error('audit insert failed'),
    );

    const cmd = new RegisterVehicleCommand(
      { ...baseDto, initialMileage: 7 },
      'user-1',
      dealershipCtx,
    );

    await expect(handler.execute(cmd)).rejects.toThrow('audit insert failed');
    expect(eventEmitterMock.emit).not.toHaveBeenCalled();
  });

  // ────────────────────────────────────────────────────────────
  // WORKSHOP / PLATFORM — fail-closed (§4.3)
  // ────────────────────────────────────────────────────────────

  it.each([
    ['WORKSHOP', workshopCtx],
    ['PLATFORM', platformCtx],
  ])('rejects registration from a %s context with 403', async (_label, ctx) => {
    const cmd = new RegisterVehicleCommand(baseDto, 'user-1', ctx);

    await expect(handler.execute(cmd)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(repositoryMock.findByLicensePlate).not.toHaveBeenCalled();
    expect(repositoryMock.create).not.toHaveBeenCalled();
    expect(repositoryMock.createDealershipRegistration).not.toHaveBeenCalled();
    expect(eventEmitterMock.emit).not.toHaveBeenCalled();
  });
});
