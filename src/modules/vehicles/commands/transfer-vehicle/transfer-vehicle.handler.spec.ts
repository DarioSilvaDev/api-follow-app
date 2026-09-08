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
});