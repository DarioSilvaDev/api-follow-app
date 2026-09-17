import { ForbiddenException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { NotFoundException } from '../../../../common/exceptions/not-found.exception';
import { CreateCareEpisodeHandler } from './create-care-episode.handler';
import { CreateCareEpisodeCommand } from './create-care-episode.command';
import { CreateCareEpisodeDto } from '../../dto/create-care-episode.dto';

describe('CreateCareEpisodeHandler — F-020 check-in flow', () => {
  let handler: CreateCareEpisodeHandler;
  let prismaMock: {
    vehicle: { findUnique: jest.Mock };
    workshopBranch: { findFirst: jest.Mock };
    appointment: { findFirst: jest.Mock };
    careEpisode: { create: jest.Mock };
  };
  let eventEmitterMock: { emit: jest.Mock };

  const workshopId = 'w1';
  const memberId = 'member-1';
  const branchId = 'branch-1';
  const vehicleId = 'v-1';

  function makeCommand(overrides: Partial<CreateCareEpisodeDto> = {}) {
    const dto: CreateCareEpisodeDto = {
      vehicleId,
      branchId,
      mileageIn: 45200,
      customerComplaint: 'Ruido en frenos',
      ...overrides,
    };
    return new CreateCareEpisodeCommand(dto, workshopId, memberId);
  }

  beforeEach(() => {
    prismaMock = {
      vehicle: { findUnique: jest.fn() },
      workshopBranch: { findFirst: jest.fn() },
      appointment: { findFirst: jest.fn() },
      careEpisode: { create: jest.fn() },
    };
    eventEmitterMock = { emit: jest.fn() };
    handler = new CreateCareEpisodeHandler(
      prismaMock as any,
      eventEmitterMock as unknown as EventEmitter2,
    );
  });

  // ──────────────────────────────────────────────────────
  // Happy path
  // ──────────────────────────────────────────────────────

  it('creates the care episode as OPEN with checkedInAt and emits the event', async () => {
    prismaMock.vehicle.findUnique.mockResolvedValue({ id: vehicleId });
    prismaMock.workshopBranch.findFirst.mockResolvedValue({ id: branchId });
    prismaMock.careEpisode.create.mockResolvedValue({
      id: 'ce-1',
      vehicleId,
      workshopId,
      branchId,
      createdByMemberId: memberId,
      status: 'open',
      checkedInAt: new Date(),
    });

    const result = await handler.execute(makeCommand());

    expect(result).toEqual(
      expect.objectContaining({ id: 'ce-1', status: 'open' }),
    );
    expect(prismaMock.careEpisode.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        vehicleId,
        workshopId,
        branchId,
        appointmentId: null,
        createdByMemberId: memberId,
        status: 'open',
        mileageIn: 45200,
        customerComplaint: 'Ruido en frenos',
        checkedInAt: expect.any(Date),
      }),
    });
    // event emitted only once, after persistence
    expect(eventEmitterMock.emit).toHaveBeenCalledTimes(1);
    expect(eventEmitterMock.emit).toHaveBeenCalledWith(
      'care-episode.created',
      expect.objectContaining({
        careEpisodeId: 'ce-1',
        vehicleId,
        workshopId,
        createdByMemberId: memberId,
      }),
    );
  });

  it('persists optional notes when provided', async () => {
    prismaMock.vehicle.findUnique.mockResolvedValue({ id: vehicleId });
    prismaMock.workshopBranch.findFirst.mockResolvedValue({ id: branchId });
    prismaMock.careEpisode.create.mockResolvedValue({ id: 'ce-1' });

    await handler.execute(
      makeCommand({
        customerNotes: 'Cliente apurado',
        internalNotes: 'Revisar suspensión delantera',
      }),
    );

    expect(prismaMock.careEpisode.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        customerNotes: 'Cliente apurado',
        internalNotes: 'Revisar suspensión delantera',
      }),
    });
  });

  it('links the appointment when given and valid', async () => {
    prismaMock.vehicle.findUnique.mockResolvedValue({ id: vehicleId });
    prismaMock.workshopBranch.findFirst.mockResolvedValue({ id: branchId });
    prismaMock.appointment.findFirst.mockResolvedValue({ id: 'appt-1' });
    prismaMock.careEpisode.create.mockResolvedValue({ id: 'ce-1' });

    await handler.execute(makeCommand({ appointmentId: 'appt-1' }));

    expect(prismaMock.appointment.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'appt-1',
        vehicleId,
        workshopId,
      },
      select: { id: true },
    });
    expect(prismaMock.careEpisode.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ appointmentId: 'appt-1' }),
    });
  });

  // ──────────────────────────────────────────────────────
  // Validation / error paths
  // ──────────────────────────────────────────────────────

  it('rejects with 404 when the vehicle does not exist (P2-3: no access assert for first contact)', async () => {
    prismaMock.vehicle.findUnique.mockResolvedValue(null);

    await expect(handler.execute(makeCommand())).rejects.toThrow(
      NotFoundException,
    );
    expect(prismaMock.careEpisode.create).not.toHaveBeenCalled();
    expect(eventEmitterMock.emit).not.toHaveBeenCalled();
  });

  it('rejects with 403 when the branch does not belong to the context workshop', async () => {
    prismaMock.vehicle.findUnique.mockResolvedValue({ id: vehicleId });
    prismaMock.workshopBranch.findFirst.mockResolvedValue(null);

    await expect(handler.execute(makeCommand())).rejects.toThrow(
      ForbiddenException,
    );
    expect(prismaMock.careEpisode.create).not.toHaveBeenCalled();
    expect(eventEmitterMock.emit).not.toHaveBeenCalled();
  });

  it('rejects with 404 when the provided appointment does not match vehicle+workshop', async () => {
    prismaMock.vehicle.findUnique.mockResolvedValue({ id: vehicleId });
    prismaMock.workshopBranch.findFirst.mockResolvedValue({ id: branchId });
    prismaMock.appointment.findFirst.mockResolvedValue(null);

    await expect(
      handler.execute(makeCommand({ appointmentId: 'foreign-appt' })),
    ).rejects.toThrow(NotFoundException);
    expect(prismaMock.careEpisode.create).not.toHaveBeenCalled();
    expect(eventEmitterMock.emit).not.toHaveBeenCalled();
  });

  it('does NOT emit the event when persistence fails', async () => {
    prismaMock.vehicle.findUnique.mockResolvedValue({ id: vehicleId });
    prismaMock.workshopBranch.findFirst.mockResolvedValue({ id: branchId });
    prismaMock.careEpisode.create.mockRejectedValue(
      new Error('db unavailable'),
    );

    await expect(handler.execute(makeCommand())).rejects.toThrow(
      'db unavailable',
    );
    expect(eventEmitterMock.emit).not.toHaveBeenCalled();
  });
});
