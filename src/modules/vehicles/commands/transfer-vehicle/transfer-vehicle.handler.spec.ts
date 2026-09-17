import { EventEmitter2 } from '@nestjs/event-emitter';
import { CodedHttpException } from '../../../../common/exceptions/coded.exception';
import { ERROR_CODES } from '../../../../common/exceptions/error-codes';
import { PrismaService } from '../../../../common/database/prisma.service';
import { VehicleTransferRequestedEvent } from '../../events/vehicle-transfer-requested.event';
import { TransferVehicleHandler } from './transfer-vehicle.handler';
import { TransferVehicleCommand } from './transfer-vehicle.command';

describe('TransferVehicleHandler — transfer por email o alias (contrato PM)', () => {
  let handler: TransferVehicleHandler;
  let prismaMock: {
    user: { findUnique: jest.Mock };
    vehicle: { findUnique: jest.Mock };
    vehicleTransfer: { findFirst: jest.Mock; create: jest.Mock };
    vehicleTransferEvent: { create: jest.Mock };
  };
  let eventEmitterMock: { emit: jest.Mock };

  const emailCommand = (
    to: string,
    from = 'from-1',
    vehicleId = 'vehicle-1',
    notes?: string,
  ) =>
    new TransferVehicleCommand(
      vehicleId,
      { recipient: { type: 'email', value: to }, notes },
      from,
    );

  const aliasCommand = (to: string, from = 'from-1', vehicleId = 'vehicle-1') =>
    new TransferVehicleCommand(
      vehicleId,
      { recipient: { type: 'alias', value: to } },
      from,
    );

  // Happy path compartido: vehículo propiedad de `from-1`, sin pending
  // vigente; la creación de transferencia y evento resuelven OK.
  const mockHappyPath = (recipientUser: { id: string }) => {
    prismaMock.user.findUnique.mockResolvedValue(recipientUser);
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
  };

  const capture = async (
    cmd: TransferVehicleCommand,
  ): Promise<CodedHttpException> => {
    try {
      await handler.execute(cmd);
    } catch (err) {
      return err as CodedHttpException;
    }
    throw new Error('expected the handler to throw');
  };

  beforeEach(() => {
    prismaMock = {
      user: { findUnique: jest.fn() },
      vehicle: { findUnique: jest.fn() },
      vehicleTransfer: { findFirst: jest.fn(), create: jest.fn() },
      vehicleTransferEvent: { create: jest.fn() },
    };
    eventEmitterMock = { emit: jest.fn() };
    handler = new TransferVehicleHandler(
      prismaMock as unknown as PrismaService,
      eventEmitterMock as unknown as EventEmitter2,
    );
  });

  // ─── Resolución por alias ─────────────────────────────────────────────

  it('alias válido → create recibe el toUserId del usuario encontrado y el evento se emite con ese ID', async () => {
    mockHappyPath({ id: 'to-1', alias: 'juan-9' });

    const result = await handler.execute(aliasCommand('Juan-9'));

    expect(result.id).toBe('t-new');
    const createCalls = prismaMock.vehicleTransfer.create.mock
      .calls as Array<[
      {
        data: {
          vehicleId: string;
          fromUserId: string;
          toUserId: string;
          status: string;
        };
      },
    ]>;
    expect(createCalls[0][0].data).toMatchObject({
      vehicleId: 'vehicle-1',
      fromUserId: 'from-1',
      toUserId: 'to-1',
      status: 'pending',
    });
    const emitCalls = eventEmitterMock.emit.mock.calls as [
      string,
      VehicleTransferRequestedEvent,
    ][];
    const [, event] = emitCalls[0];
    expect(event.eventName).toBe('vehicle.transfer.requested');
    expect(event.transferId).toBe('t-new');
    expect(event.vehicleId).toBe('vehicle-1');
    expect(event.fromUserId).toBe('from-1');
    expect(event.toUserId).toBe('to-1');
  });

  it('normaliza SIEMPRE el alias: " Juan-9 " → findUnique({ where: { alias: "juan-9" } })', async () => {
    mockHappyPath({ id: 'to-1', alias: 'juan-9' });

    await handler.execute(aliasCommand(' Juan-9 '));

    expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
      where: { alias: 'juan-9' },
    });
  });

  it('alias inexistente → 400 genérico; no se ejecuta la creación', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);

    const thrown = await capture(aliasCommand('ghost-user'));

    expect(thrown).toBeInstanceOf(CodedHttpException);
    expect(thrown.getStatus()).toBe(400);
    expect(thrown.getCode()).toBe(ERROR_CODES.VALIDATION_ERROR);
    expect(
      (thrown.getResponse() as { errors: { code: string } }).errors.code,
    ).toBe('TRANSFER_RECIPIENT_NOT_FOUND');
    // El mensaje no debe revelar el alias buscado (anti-enumeración SR#12).
    expect(thrown.message).not.toContain('ghost-user');
    expect(thrown.message).not.toMatch(/not found/i);
    expect(prismaMock.vehicleTransfer.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.vehicleTransfer.create).not.toHaveBeenCalled();
    expect(eventEmitterMock.emit).not.toHaveBeenCalled();
  });

  // ─── Paridad anti-enumeración (SR#12) ─────────────────────────────────

  it('paridad: alias inexistente y email inexistente responden idéntico (status, message, code top-level, errors.code)', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);

    const shape = (err: CodedHttpException) => {
      const res = err.getResponse() as {
        statusCode: number;
        message: string;
        code: string;
        errors: { code: string };
      };
      return {
        statusCode: res.statusCode,
        message: res.message,
        code: res.code,
        subCode: res.errors.code,
      };
    };

    expect(shape(await capture(aliasCommand('ghost-user')))).toEqual(
      shape(await capture(emailCommand('ghost@example.com'))),
    );
  });

  it('email inexistente → 400 genérico (no confirma que el email existe) — regresión SR#12', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);

    const thrown = await capture(emailCommand('someone@example.com'));

    expect(thrown).toBeInstanceOf(CodedHttpException);
    expect(thrown.getStatus()).toBe(400);
    expect(thrown.getCode()).toBe(ERROR_CODES.VALIDATION_ERROR);
    expect(thrown.message).not.toContain('someone@example.com');
    expect(thrown.message).not.toMatch(/not found/i);
    expect(prismaMock.vehicleTransfer.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.vehicleTransfer.create).not.toHaveBeenCalled();
    expect(eventEmitterMock.emit).not.toHaveBeenCalled();
  });

  // ─── Auto-transferencia ───────────────────────────────────────────────

  it('alias propio → 400 "Cannot transfer vehicle to yourself"', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'from-1',
      alias: 'juan-9',
    });

    const thrown = await capture(aliasCommand('juan-9'));

    expect(thrown).toBeInstanceOf(CodedHttpException);
    expect(thrown.getStatus()).toBe(400);
    expect(thrown.message).toBe('Cannot transfer vehicle to yourself');
    expect(
      (thrown.getResponse() as { errors: { code: string } }).errors.code,
    ).toBe('TRANSFER_SELF');
    expect(prismaMock.vehicleTransfer.create).not.toHaveBeenCalled();
  });

  it('email propio → 400 "Cannot transfer vehicle to yourself" (regresión)', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'from-1',
      email: 'me@example.com',
    });

    const thrown = await capture(emailCommand('me@example.com'));

    expect(thrown).toBeInstanceOf(CodedHttpException);
    expect(thrown.getStatus()).toBe(400);
    expect(thrown.message).toBe('Cannot transfer vehicle to yourself');
    expect(prismaMock.vehicleTransfer.create).not.toHaveBeenCalled();
  });

  // ─── metadata recipientLookup (aditivo, sin PII) ──────────────────────

  it('registra metadata.recipientLookup = canal en el evento de transferencia', async () => {
    mockHappyPath({ id: 'to-1' });

    await handler.execute(aliasCommand('juan-9'));

    const eventCreateCalls = prismaMock.vehicleTransferEvent.create.mock
      .calls as Array<[{ data: { metadata?: Record<string, string> } }]>;
    expect(eventCreateCalls[0][0].data.metadata).toEqual({
      recipientLookup: 'alias',
    });
  });

  it('registra metadata.recipientLookup = "email" cuando el canal es email', async () => {
    mockHappyPath({ id: 'to-1' });

    await handler.execute(emailCommand('to@example.com'));

    const eventCreateCalls = prismaMock.vehicleTransferEvent.create.mock
      .calls as Array<[{ data: { metadata?: Record<string, string> } }]>;
    expect(eventCreateCalls[0][0].data.metadata).toEqual({
      recipientLookup: 'email',
    });
  });

  it('sin PII: el evento emitido solo lleva IDs (ni email ni alias del destinatario)', async () => {
    mockHappyPath({ id: 'to-1', alias: 'juan-9' });

    await handler.execute(aliasCommand('Juan-9'));

    const emitCalls = eventEmitterMock.emit.mock.calls as [
      string,
      VehicleTransferRequestedEvent,
    ][];
    const [, event] = emitCalls[0];
    expect(event.toUserId).toBe('to-1');
    const serialized = JSON.stringify(event);
    expect(serialized).not.toContain('juan-9');
    expect(serialized).not.toContain('@');
  });

  // ─── D-092: pending vigente bloquea / vencida no bloquea ──────────────

  it('D-092: blockea con 400 cuando existe una transferencia pending vigente (email)', async () => {
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

    const thrown = await capture(emailCommand('to@example.com'));

    expect(thrown).toBeInstanceOf(CodedHttpException);
    expect(thrown.getStatus()).toBe(400);
    expect(thrown.message).toBe(
      'There is already a pending transfer for this vehicle',
    );
    expect(
      (thrown.getResponse() as { errors: { code: string } }).errors.code,
    ).toBe('TRANSFER_PENDING');
    expect(prismaMock.vehicleTransfer.create).not.toHaveBeenCalled();
  });

  it('D-092: pending vencida no bloquea y no se filtra del where (email, regresión)', async () => {
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

    const result = await handler.execute(emailCommand('to@example.com'));

    expect(prismaMock.vehicleTransfer.create).toHaveBeenCalledTimes(1);
    expect(result.id).toBe('t-new');

const anyExpiringDate = expect.any(Date) as Date;
    const findFirstCalls = prismaMock.vehicleTransfer.findFirst.mock
      .calls as Array<[
      {
        where: {
          vehicleId: string;
          status: string;
          OR: [{ expiresAt: null }, { expiresAt: { gt: Date } }];
        };
      },
    ]>;
    expect(findFirstCalls[0][0].where).toEqual({
      vehicleId: 'vehicle-1',
      status: 'pending',
      OR: [{ expiresAt: null }, { expiresAt: { gt: anyExpiringDate } }],
    });
  });

  it.each(['email', 'alias'])(
    'D-092 (%s): pending vigente bloquea con 400 TRANSFER_PENDING',
    async (channel) => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'to-1',
        ...(channel === 'email'
          ? { email: 'to@example.com' }
          : { alias: 'juan-9' }),
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

      const cmd =
        channel === 'email'
          ? emailCommand('to@example.com')
          : aliasCommand('juan-9');
      const thrown = await capture(cmd);

      expect(thrown).toBeInstanceOf(CodedHttpException);
      expect(thrown.getStatus()).toBe(400);
      expect(thrown.message).toBe(
        'There is already a pending transfer for this vehicle',
      );
      expect(prismaMock.vehicleTransfer.create).not.toHaveBeenCalled();
    },
  );

  it.each(['email', 'alias'])(
    'D-092 (%s): pending vencida no bloquea y se crea la transferencia',
    async (channel) => {
      mockHappyPath({
        id: 'to-1',
        ...(channel === 'email'
          ? { email: 'to@example.com' }
          : { alias: 'juan-9' }),
      });

      const cmd =
        channel === 'email'
          ? emailCommand('to@example.com')
          : aliasCommand('juan-9');
      await handler.execute(cmd);

      expect(prismaMock.vehicleTransfer.create).toHaveBeenCalledTimes(1);
      const createCalls = prismaMock.vehicleTransfer.create.mock
        .calls as Array<[{ data: { toUserId: string } }]>;
      expect(createCalls[0][0].data.toUserId).toBe('to-1');
    },
  );
});
