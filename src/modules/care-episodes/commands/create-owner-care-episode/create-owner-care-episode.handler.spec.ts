import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { NotFoundException } from '../../../../common/exceptions/not-found.exception';
import { VehicleAccessService } from '../../../../common/authorization/vehicle-access.service';
import { CreateOwnerCareEpisodeHandler } from './create-owner-care-episode.handler';
import { CreateOwnerCareEpisodeCommand } from './create-owner-care-episode.command';
import { CreateOwnerCareEpisodeDto } from '../../dto/create-owner-care-episode.dto';

describe('CreateOwnerCareEpisodeHandler — RF-1 owner records a service', () => {
  let handler: CreateOwnerCareEpisodeHandler;
  let prismaMock: {
    vehicle: { findUnique: jest.Mock };
    workshop: { findFirst: jest.Mock };
    careEpisode: { create: jest.Mock };
  };
  let accessMock: { assertOwnership: jest.Mock };
  let eventEmitterMock: { emit: jest.Mock };

  const vehicleId = 'v-1';
  const userId = 'user-1';
  const workshopId = 'w-1';

  const personalCtx = { type: 'PERSONAL' } as const;
  const workshopCtx = {
    type: 'WORKSHOP',
    workshopId,
    memberId: 'm-1',
  } as const;

  function makeDto(overrides: Partial<CreateOwnerCareEpisodeDto> = {}) {
    // Sin workshopName por defecto: el XOR se prueba explícitamente en cada caso.
    const dto: CreateOwnerCareEpisodeDto = {
      vehicleId,
      title: 'Cambio de aceite',
      serviceDate: '2026-09-10T10:00:00.000Z',
      ...overrides,
    };
    return dto;
  }

  function makeCommand(
    overrides: Partial<CreateOwnerCareEpisodeDto> = {},
    ctx: typeof personalCtx | typeof workshopCtx = personalCtx,
  ) {
    return new CreateOwnerCareEpisodeCommand(makeDto(overrides), {
      id: userId,
      email: 'owner@example.com',
      role: 'user',
    } as never);
  }

  beforeEach(() => {
    prismaMock = {
      vehicle: { findUnique: jest.fn() },
      workshop: { findFirst: jest.fn() },
      careEpisode: { create: jest.fn() },
    };
    accessMock = { assertOwnership: jest.fn() };
    eventEmitterMock = { emit: jest.fn() };
    handler = new CreateOwnerCareEpisodeHandler(
      prismaMock as any,
      accessMock as unknown as VehicleAccessService,
      eventEmitterMock as unknown as EventEmitter2,
    );
  });

  // ──────────────────────────────────────────────────────
  // Context
  // ──────────────────────────────────────────────────────

  it('rejects 403 when the context is NOT PERSONAL', async () => {
    await expect(
      handler.execute(makeCommand({}, workshopCtx), workshopCtx),
    ).rejects.toThrow(ForbiddenException);
    expect(prismaMock.careEpisode.create).not.toHaveBeenCalled();
    expect(eventEmitterMock.emit).not.toHaveBeenCalled();
  });

  // ──────────────────────────────────────────────────────
  // serviceDate
  // ──────────────────────────────────────────────────────

  it('rejects 400 when serviceDate is in the future', async () => {
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    await expect(
      handler.execute(makeCommand({ serviceDate: future }), personalCtx),
    ).rejects.toThrow(BadRequestException);
    expect(prismaMock.careEpisode.create).not.toHaveBeenCalled();
  });

  it('accepts a serviceDate set to the end of the current UTC day (same-day boundary)', async () => {
    prismaMock.vehicle.findUnique.mockResolvedValue({ id: vehicleId });
    accessMock.assertOwnership.mockResolvedValue(undefined);
    prismaMock.careEpisode.create.mockResolvedValue({ id: 'ce-1' });

    const endOfUtcDay = new Date();
    endOfUtcDay.setUTCHours(23, 59, 59, 999);
    await handler.execute(
      makeCommand({
        serviceDate: endOfUtcDay.toISOString(),
        workshopName: 'Taller Don Pepe',
      }),
      personalCtx,
    );

    expect(prismaMock.careEpisode.create).toHaveBeenCalled();
    expect(eventEmitterMock.emit).toHaveBeenCalledTimes(1);
  });

  // ──────────────────────────────────────────────────────
  // XOR taller responsable
  // ──────────────────────────────────────────────────────

  it('rejects 400 when both workshopId and workshopName are provided', async () => {
    await expect(
      handler.execute(
        makeCommand({ workshopId, workshopName: 'Taller X' }),
        personalCtx,
      ),
    ).rejects.toThrow(BadRequestException);
    expect(prismaMock.careEpisode.create).not.toHaveBeenCalled();
  });

  it('rejects 400 when neither workshopId nor workshopName is provided', async () => {
    await expect(
      handler.execute(
        makeCommand({ workshopId: undefined, workshopName: undefined }),
        personalCtx,
      ),
    ).rejects.toThrow(BadRequestException);
    expect(prismaMock.careEpisode.create).not.toHaveBeenCalled();
  });

  // ──────────────────────────────────────────────────────
  // Vehículo
  // ──────────────────────────────────────────────────────

  it('rejects 404 when the vehicle does not exist', async () => {
    prismaMock.vehicle.findUnique.mockResolvedValue(null);

    await expect(
      handler.execute(
        makeCommand({ workshopName: 'Taller Don Pepe' }),
        personalCtx,
      ),
    ).rejects.toThrow(NotFoundException);
    expect(accessMock.assertOwnership).not.toHaveBeenCalled();
    expect(prismaMock.careEpisode.create).not.toHaveBeenCalled();
    expect(eventEmitterMock.emit).not.toHaveBeenCalled();
  });

  it('rejects 403 when the user does not own the vehicle (assertOwnership)', async () => {
    prismaMock.vehicle.findUnique.mockResolvedValue({ id: vehicleId });
    accessMock.assertOwnership.mockRejectedValue(
      new ForbiddenException(
        'Only the vehicle owner can perform this operation',
      ),
    );

    await expect(
      handler.execute(
        makeCommand({ workshopName: 'Taller Don Pepe' }),
        personalCtx,
      ),
    ).rejects.toThrow(ForbiddenException);
    expect(prismaMock.careEpisode.create).not.toHaveBeenCalled();
    expect(eventEmitterMock.emit).not.toHaveBeenCalled();
  });

  // ──────────────────────────────────────────────────────
  // workshopId (taller de la app)
  // ──────────────────────────────────────────────────────

  it('rejects 404 when the app workshop does not exist or is inactive', async () => {
    prismaMock.vehicle.findUnique.mockResolvedValue({ id: vehicleId });
    accessMock.assertOwnership.mockResolvedValue(undefined);
    prismaMock.workshop.findFirst.mockResolvedValue(null);

    await expect(
      handler.execute(makeCommand({ workshopId }), personalCtx),
    ).rejects.toThrow(NotFoundException);
    expect(prismaMock.workshop.findFirst).toHaveBeenCalledWith({
      where: { id: workshopId, isActive: true },
      select: { id: true },
    });
    expect(prismaMock.careEpisode.create).not.toHaveBeenCalled();
  });

  // ──────────────────────────────────────────────────────
  // Happy paths
  // ──────────────────────────────────────────────────────

  it('creates an owner care episode with workshopId (delivered + unverified) and emits the event', async () => {
    prismaMock.vehicle.findUnique.mockResolvedValue({ id: vehicleId });
    accessMock.assertOwnership.mockResolvedValue(undefined);
    prismaMock.workshop.findFirst.mockResolvedValue({ id: workshopId });
    prismaMock.careEpisode.create.mockResolvedValue({
      id: 'ce-1',
      vehicleId,
      source: 'owner',
      status: 'delivered',
      verification: 'unverified',
      workshopId,
      createdByUserId: userId,
    });

    const result = await handler.execute(
      makeCommand({
        workshopId,
        mileageIn: 45200,
        notes: 'Hace ruido al frenar',
      }),
      personalCtx,
    );

    expect(result).toEqual(expect.objectContaining({ id: 'ce-1' }));
    expect(prismaMock.careEpisode.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        vehicleId,
        source: 'owner',
        status: 'delivered',
        verification: 'unverified',
        title: 'Cambio de aceite',
        mileageIn: 45200,
        customerNotes: 'Hace ruido al frenar',
        workshopId,
        workshopName: null,
        createdByUserId: userId,
        checkedInAt: null,
        createdByMemberId: null,
        branchId: null,
      }),
    });
    expect(eventEmitterMock.emit).toHaveBeenCalledTimes(1);
    expect(eventEmitterMock.emit).toHaveBeenCalledWith(
      'care-episode.created',
      expect.objectContaining({
        careEpisodeId: 'ce-1',
        vehicleId,
        source: 'owner',
        workshopId,
        createdByMemberId: null,
        createdByUserId: userId,
      }),
    );
  });

  it('creates an owner care episode with free-text workshopName', async () => {
    prismaMock.vehicle.findUnique.mockResolvedValue({ id: vehicleId });
    accessMock.assertOwnership.mockResolvedValue(undefined);
    prismaMock.careEpisode.create.mockResolvedValue({ id: 'ce-2' });

    await handler.execute(
      makeCommand({ workshopName: 'Taller Don Pepe' }),
      personalCtx,
    );

    expect(prismaMock.workshop.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.careEpisode.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workshopId: null,
        workshopName: 'Taller Don Pepe',
      }),
    });
    expect(eventEmitterMock.emit).toHaveBeenCalledWith(
      'care-episode.created',
      expect.objectContaining({
        source: 'owner',
        workshopId: null,
        createdByUserId: userId,
      }),
    );
  });

  it('persists notes as customerNotes and leaves workshop internal fields null', async () => {
    prismaMock.vehicle.findUnique.mockResolvedValue({ id: vehicleId });
    accessMock.assertOwnership.mockResolvedValue(undefined);
    prismaMock.careEpisode.create.mockResolvedValue({ id: 'ce-3' });

    await handler.execute(
      makeCommand({ workshopName: 'Taller Don Pepe' }),
      personalCtx,
    );

    expect(prismaMock.careEpisode.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        serviceDate: expect.any(Date),
        customerNotes: null,
        branchId: null,
        title: 'Cambio de aceite',
      }),
    });
  });

  it('does NOT emit the event when persistence fails', async () => {
    prismaMock.vehicle.findUnique.mockResolvedValue({ id: vehicleId });
    accessMock.assertOwnership.mockResolvedValue(undefined);
    prismaMock.careEpisode.create.mockRejectedValue(
      new Error('db unavailable'),
    );

    await expect(
      handler.execute(
        makeCommand({ workshopName: 'Taller Don Pepe' }),
        personalCtx,
      ),
    ).rejects.toThrow('db unavailable');
    expect(eventEmitterMock.emit).not.toHaveBeenCalled();
  });
});
