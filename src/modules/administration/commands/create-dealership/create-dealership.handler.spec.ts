import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import { CodedHttpException } from '../../../../common/exceptions/coded.exception';
import { CreateDealershipHandler } from './create-dealership.handler';
import { CreateDealershipCommand } from './create-dealership.command';

// uuid@14 es ESM-only; se mockea para que ts-jest cargue el handler y el
// token sea determinístico (mismo patrón que register.handler.spec.ts).
jest.mock('uuid', () => ({
  v4: jest.fn().mockReturnValue('token-secreto'),
}));

describe('CreateDealershipHandler (admin) — D-106 onboarding administrado', () => {
  let handler: CreateDealershipHandler;
  let prismaMock: {
    dealership: { findFirst: jest.Mock; findUnique: jest.Mock };
    permission: { findMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let eventEmitterMock: { emit: jest.Mock };

  const txMock = () => ({
    dealership: {
      create: jest.fn(),
    },
    dealershipRole: {
      findUnique: jest.fn(),
    },
    dealershipInvitation: {
      create: jest.fn(),
    },
  });

  beforeEach(() => {
    prismaMock = {
      dealership: { findFirst: jest.fn(), findUnique: jest.fn() },
      permission: { findMany: jest.fn() },
      $transaction: jest.fn(),
    };
    eventEmitterMock = { emit: jest.fn() };
    handler = new CreateDealershipHandler(
      prismaMock as any,
      eventEmitterMock as unknown as EventEmitter2,
    );
  });

  const permissionStub = [
    { id: 'p-dealership.update', code: 'dealership.update' },
    { id: 'p-dealership.members.invite', code: 'dealership.members.invite' },
    { id: 'p-dealership.vehicle.take', code: 'dealership.vehicle.take' },
    { id: 'p-dealership.vehicle.sell', code: 'dealership.vehicle.sell' },
    { id: 'p-dealership.vehicle.return', code: 'dealership.vehicle.return' },
    { id: 'p-care-episode.create', code: 'care-episode.create' },
    { id: 'p-history.view', code: 'history.view' },
  ];

  const setupHappyPath = (overrides: Record<string, unknown> = {}) => {
    prismaMock.dealership.findFirst.mockResolvedValue(null);
    prismaMock.dealership.findUnique.mockResolvedValue(null);
    prismaMock.permission.findMany.mockResolvedValue(permissionStub);
    const tx = txMock();
    tx.dealership.create.mockResolvedValue({
      id: 'dealership-1',
      name: 'Concesionaria Nueva',
      taxId: '30123456789',
      email: 'dueno@example.com',
      status: 'pending_claim',
      isActive: true,
      claimedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    });
    tx.dealershipRole.findUnique.mockResolvedValue({ id: 'role-owner' });
    tx.dealershipInvitation.create.mockResolvedValue({
      id: 'inv-1',
      dealershipId: 'dealership-1',
      roleId: 'role-owner',
      email: 'dueno@example.com',
      token: 'token-secreto',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      status: 'pending',
    });
    prismaMock.$transaction.mockImplementation(
      async (cb: (tx: ReturnType<typeof txMock>) => unknown) => cb(tx),
    );
    return { tx };
  };

  it('crea la dealership en pending_claim con roles default e invitación (sin exponer token)', async () => {
    const { tx } = setupHappyPath();

    const result = await handler.execute(
      new CreateDealershipCommand(
        {
          name: 'Concesionaria Nueva',
          taxId: '30-12345678-9', // se normaliza a dígitos
          ownerEmail: 'DUENO@example.com', // se normaliza a lowercase
        },
        'admin-1',
      ),
    );

    expect(result.status).toBe('pending_claim');
    expect(result.email).toBe('dueno@example.com');
    expect(result.taxId).toBe('30123456789');
    // El token de la invitación NUNCA viaja en la respuesta.
    expect(result.invitation).toEqual({
      id: 'inv-1',
      email: 'dueno@example.com',
      expiresAt: expect.any(Date),
      status: 'pending',
    });
    expect(JSON.stringify(result)).not.toContain('token-secreto');

    // Transaccional: roles creados con la matriz RB-10 + invitación owner.
    const createData = tx.dealership.create.mock.calls[0][0].data;
    expect(createData.status).toBe('pending_claim');
    expect(createData.isActive).toBe(true);
    expect(createData.roles.create.map((r: any) => r.code)).toEqual([
      'owner',
      'admin',
      'seller',
    ]);
    const ownerRoleCreate = createData.roles.create.find(
      (r: any) => r.code === 'owner',
    );
    expect(
      ownerRoleCreate.permissions.create.map((p: any) => p.permissionId),
    ).toContain('p-dealership.vehicle.sell');
    expect(tx.dealershipInvitation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        roleId: 'role-owner',
        status: 'pending',
      }),
    });
  });

  it('emite dealership.member.invited con dealershipName y token (para el mail)', async () => {
    setupHappyPath();

    await handler.execute(
      new CreateDealershipCommand(
        { name: 'Concesionaria Nueva', ownerEmail: 'dueno@example.com' },
        'admin-1',
      ),
    );

    expect(eventEmitterMock.emit).toHaveBeenCalledTimes(1);
    const [eventName, event] = eventEmitterMock.emit.mock.calls[0];
    expect(eventName).toBe('dealership.member.invited');
    expect(event).toEqual(
      expect.objectContaining({
        dealershipId: 'dealership-1',
        email: 'dueno@example.com',
        token: 'token-secreto',
        dealershipName: 'Concesionaria Nueva',
      }),
    );
  });

  it('rechaza con 409 CONFLICT si el nombre ya existe (case-insensitive)', async () => {
    prismaMock.dealership.findFirst.mockResolvedValue({ id: 'existing' });

    await expect(
      handler.execute(
        new CreateDealershipCommand(
          { name: 'concesionaria nueva', ownerEmail: 'a@example.com' },
          'admin-1',
        ),
      ),
    ).rejects.toThrow(CodedHttpException);
    await expect(
      handler.execute(
        new CreateDealershipCommand(
          { name: 'concesionaria nueva', ownerEmail: 'a@example.com' },
          'admin-1',
        ),
      ),
    ).rejects.toMatchObject({ status: 409, getCode: expect.any(Function) });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('rechaza con 409 CONFLICT si el CUIT ya existe (pre-check normalizado)', async () => {
    prismaMock.dealership.findFirst.mockResolvedValue(null);
    // CUIT normalizado colisiona con uno existente
    prismaMock.dealership.findUnique.mockResolvedValue({ id: 'existing' });

    await expect(
      handler.execute(
        new CreateDealershipCommand(
          { name: 'Otra', taxId: '30-12345678-9', ownerEmail: 'a@example.com' },
          'admin-1',
        ),
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('mapea P2002 sobre tax_id a 409 CONFLICT controlado (race)', async () => {
    prismaMock.dealership.findFirst.mockResolvedValue(null);
    prismaMock.dealership.findUnique.mockResolvedValue(null);
    prismaMock.permission.findMany.mockResolvedValue(permissionStub);
    const prismaError = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed on the fields: (`tax_id`)',
      {
        code: 'P2002',
        clientVersion: '6.19.3',
        meta: { target: ['tax_id'] },
      },
    );
    prismaMock.$transaction.mockRejectedValue(prismaError);

    await expect(
      handler.execute(
        new CreateDealershipCommand(
          { name: 'Otra', taxId: '30123456789', ownerEmail: 'a@example.com' },
          'admin-1',
        ),
      ),
    ).rejects.toMatchObject({
      status: 409,
      message: expect.stringContaining('CUIT'),
    });
    expect(eventEmitterMock.emit).not.toHaveBeenCalled();
  });
});
