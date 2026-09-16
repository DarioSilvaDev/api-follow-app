import { BadRequestException } from '@nestjs/common';
import { TransferVehicleHandler } from './transfer-vehicle.handler';
import { TransferVehicleCommand } from './transfer-vehicle.command';

describe('TransferVehicleHandler — no account enumeration (Security Review #12)', () => {
  let handler: TransferVehicleHandler;
  let prismaMock: any;
  let eventEmitterMock: { emit: jest.Mock };

  beforeEach(() => {
    prismaMock = {
      user: { findUnique: jest.fn() },
      vehicle: { findUnique: jest.fn() },
      vehicleTransfer: { findFirst: jest.fn(), create: jest.fn() },
      vehicleTransferEvent: { create: jest.fn() },
    };
    eventEmitterMock = { emit: jest.fn() };
    handler = new TransferVehicleHandler(prismaMock, eventEmitterMock as any);
  });

  it('returns a generic message (does not confirm the recipient email exists)', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);

    const cmd = new TransferVehicleCommand(
      'vehicle-1',
      { email: 'someone@example.com' },
      'from-1',
    );

    let thrown: any;
    try {
      await handler.execute(cmd);
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(BadRequestException);
    // The message must not embed the searched email (account enumeration).
    expect(thrown.message).not.toContain('someone@example.com');
    expect(thrown.message).not.toMatch(/not found/i);
  });

  // --- D-092: expired pending transfers do not block new ones ---

  it('D-092: filters expired pending transfers out of the existingPending check', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'to-1',
      email: 'to@example.com',
    });
    prismaMock.vehicle.findUnique.mockResolvedValue({
      id: 'vehicle-1',
      ownerships: [{ userId: 'from-1' }],
    });
    prismaMock.vehicleTransfer.findFirst.mockResolvedValue(null);
    prismaMock.vehicleTransfer.create.mockResolvedValue({
      id: 't-new',
      status: 'pending',
    });
    prismaMock.vehicleTransferEvent.create.mockResolvedValue({});

    const cmd = new TransferVehicleCommand(
      'vehicle-1',
      { email: 'to@example.com' },
      'from-1',
    );

    const result = await handler.execute(cmd);

    // An expired pending (expiresAt < now) does NOT block the new transfer.
    expect(prismaMock.vehicleTransfer.create).toHaveBeenCalledTimes(1);
    expect(result.id).toBe('t-new');

    // The where clause sent to Prisma only matches alive pending transfers.
    const findFirstArg = prismaMock.vehicleTransfer.findFirst.mock.calls[0][0];
    expect(findFirstArg.where).toEqual({
      vehicleId: 'vehicle-1',
      status: 'pending',
      OR: [{ expiresAt: null }, { expiresAt: { gt: expect.any(Date) } }],
    });
  });

  it('D-092: still blocks with 400 when there is an alive pending transfer', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'to-1',
      email: 'to@example.com',
    });
    prismaMock.vehicle.findUnique.mockResolvedValue({
      id: 'vehicle-1',
      ownerships: [{ userId: 'from-1' }],
    });
    prismaMock.vehicleTransfer.findFirst.mockResolvedValue({
      id: 'pending-alive',
      status: 'pending',
      expiresAt: new Date(Date.now() + 60_000),
    });

    const cmd = new TransferVehicleCommand(
      'vehicle-1',
      { email: 'to@example.com' },
      'from-1',
    );

    let thrown: any;
    try {
      await handler.execute(cmd);
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(BadRequestException);
    expect(thrown.message).toBe(
      'There is already a pending transfer for this vehicle',
    );
    expect(prismaMock.vehicleTransfer.create).not.toHaveBeenCalled();
  });

  it('D-092: regression — generic anti-enumeration 400 is preserved', async () => {
    // Recipient does not exist → 400 with generic message, no confirmation.
    prismaMock.user.findUnique.mockResolvedValue(null);

    const cmd = new TransferVehicleCommand(
      'vehicle-1',
      { email: 'ghost@example.com' },
      'from-1',
    );

    let thrown: any;
    try {
      await handler.execute(cmd);
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(BadRequestException);
    expect(thrown.message).not.toContain('ghost@example.com');
    expect(prismaMock.vehicleTransfer.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.vehicleTransfer.create).not.toHaveBeenCalled();
    expect(eventEmitterMock.emit).not.toHaveBeenCalled();
  });
});
