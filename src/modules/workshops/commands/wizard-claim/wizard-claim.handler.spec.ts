import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  AuthRequiredException,
  InvitationInvalidException,
  PermissionDeniedException,
} from '../../../../common/exceptions/coded.exception';
import { WizardClaimHandler } from './wizard-claim.handler';
import { WizardClaimCommand } from './wizard-claim.command';

jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('hashed-password'),
}));

describe('WizardClaimHandler (workshops) — D-106 claim del wizard de onboarding', () => {
  let handler: WizardClaimHandler;
  let prismaMock: {
    workshopInvitation: { findUnique: jest.Mock };
    user: { findFirst: jest.Mock };
    $transaction: jest.Mock;
  };
  let eventEmitterMock: { emit: jest.Mock };
  let permissionCacheMock: { invalidateUser: jest.Mock };

  const baseInvitation = {
    id: 'inv-1',
    workshopId: 'w1',
    email: 'dueno@example.com',
    token: 'tok-1',
    status: 'pending',
    expiresAt: new Date(Date.now() + 100000),
    createdAt: new Date('2026-01-01T00:00:00Z'),
    workshop: {
      id: 'w1',
      name: 'Taller Norte',
      status: 'pending_claim',
    },
  };

  const existingUser = {
    id: 'u1',
    email: 'dueno@example.com',
    firstName: 'Dueño',
    lastName: 'Test',
    phone: null,
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const makeTxMock = () => ({
    workshopInvitation: { updateMany: jest.fn() },
    workshop: { updateMany: jest.fn(), findUniqueOrThrow: jest.fn() },
    user: { create: jest.fn(), update: jest.fn() },
    workshopRole: { findUnique: jest.fn() },
    workshopMember: { create: jest.fn() },
  });

  const registerTx = (tx: ReturnType<typeof makeTxMock>) => {
    prismaMock.$transaction.mockImplementation(
      async (cb: (t: ReturnType<typeof makeTxMock>) => unknown) => cb(tx),
    );
  };

  beforeEach(() => {
    prismaMock = {
      workshopInvitation: { findUnique: jest.fn() },
      user: { findFirst: jest.fn() },
      $transaction: jest.fn(),
    };
    eventEmitterMock = { emit: jest.fn() };
    permissionCacheMock = { invalidateUser: jest.fn() };
    handler = new WizardClaimHandler(
      prismaMock as any,
      eventEmitterMock as unknown as EventEmitter2,
      permissionCacheMock as any,
    );
  });

  const setupHappyPath = (
    user: object | null = null,
    txOverrides: Partial<ReturnType<typeof makeTxMock>> = {},
  ) => {
    prismaMock.workshopInvitation.findUnique.mockResolvedValue(baseInvitation);
    prismaMock.user.findFirst.mockResolvedValue(user);
    const tx = makeTxMock();
    tx.workshopInvitation.updateMany.mockResolvedValue({ count: 1 });
    tx.workshop.updateMany.mockResolvedValue({ count: 1 });
    tx.workshopRole.findUnique.mockResolvedValue({
      id: 'role-owner',
      code: 'owner',
    });
    tx.workshopMember.create.mockResolvedValue({
      id: 'member-1',
      workshopId: 'w1',
      userId: user?.id ?? 'u-new',
      role: { code: 'owner' },
    });
    tx.workshop.findUniqueOrThrow.mockResolvedValue({
      id: 'w1',
      name: 'Taller Norte',
      status: 'active',
      email: 'dueno@example.com',
      phone: null,
      website: null,
      description: null,
    });
    if (txOverrides.workshopInvitation) {
      tx.workshopInvitation = txOverrides.workshopInvitation;
    }
    if (txOverrides.workshop) {
      tx.workshop = txOverrides.workshop;
    }
    registerTx(tx);
    return tx;
  };

  it('rechaza token inexistente con 404 INVITATION_INVALID', async () => {
    prismaMock.workshopInvitation.findUnique.mockResolvedValue(null);

    await expect(
      handler.execute(
        new WizardClaimCommand({
          token: 'x',
          email: 'a@b.com',
          password: '12345678',
        }),
      ),
    ).rejects.toThrow(InvitationInvalidException);
  });

  it('rechaza invitación expirada con 400 INVITATION_EXPIRED', async () => {
    prismaMock.workshopInvitation.findUnique.mockResolvedValue({
      ...baseInvitation,
      expiresAt: new Date(Date.now() - 1000),
    });

    await expect(
      handler.execute(
        new WizardClaimCommand({
          token: 'tok-1',
          email: 'dueno@example.com',
          password: '12345678',
        }),
      ),
    ).rejects.toMatchObject({ status: 400 });
    expect(prismaMock.user.findFirst).not.toHaveBeenCalled();
  });

  it('rechaza invitación usada/cancelada con 409', async () => {
    prismaMock.workshopInvitation.findUnique.mockResolvedValue({
      ...baseInvitation,
      status: 'accepted',
    });
    await expect(
      handler.execute(
        new WizardClaimCommand({ token: 'tok-1', email: 'dueno@example.com' }),
      ),
    ).rejects.toMatchObject({ status: 409 });

    prismaMock.workshopInvitation.findUnique.mockResolvedValue({
      ...baseInvitation,
      status: 'cancelled',
    });
    await expect(
      handler.execute(
        new WizardClaimCommand({ token: 'tok-1', email: 'dueno@example.com' }),
      ),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('rechaza email que no matchea la invitación con 403 PERMISSION_DENIED', async () => {
    prismaMock.workshopInvitation.findUnique.mockResolvedValue(baseInvitation);

    await expect(
      handler.execute(
        new WizardClaimCommand({
          token: 'tok-1',
          email: 'otro@example.com',
          password: '12345678',
        }),
      ),
    ).rejects.toThrow(PermissionDeniedException);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('exige firstName/lastName/password para cuenta nueva (400 VALIDATION_ERROR)', async () => {
    setupHappyPath(null);

    await expect(
      handler.execute(
        new WizardClaimCommand({ token: 'tok-1', email: 'dueno@example.com' }),
      ),
    ).rejects.toMatchObject({ status: 400 });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('crea cuenta nueva active + credential y completa el onboarding', async () => {
    const tx = setupHappyPath(null);
    tx.user.create.mockResolvedValue({
      id: 'u-new',
      email: 'dueno@example.com',
      firstName: 'Dueño',
      lastName: 'Test',
      phone: '011-1234',
      status: 'active',
    });

    const result = await handler.execute(
      new WizardClaimCommand({
        token: 'tok-1',
        email: 'DUENO@example.com', // case-insensitive
        firstName: 'Dueño',
        lastName: 'Test',
        password: '12345678',
        phone: '011-1234',
        workshop: { phone: '011-9999', website: 'www.taller.com' },
      }),
    );

    // Transaccional: invitación aceptada + taller activo con claimedAt
    expect(tx.workshopInvitation.updateMany).toHaveBeenCalledWith({
      where: { id: 'inv-1', status: 'pending' },
      data: { status: 'accepted', acceptedAt: expect.any(Date) },
    });
    expect(tx.workshop.updateMany).toHaveBeenCalledWith({
      where: { id: 'w1', status: 'pending_claim' },
      data: expect.objectContaining({
        status: 'active',
        claimedAt: expect.any(Date),
        phone: '011-9999',
        website: 'www.taller.com',
      }),
    });
    expect(tx.user.create).toHaveBeenCalledWith({
      data: {
        email: 'dueno@example.com',
        firstName: 'Dueño',
        lastName: 'Test',
        phone: '011-1234',
        status: 'active',
        // D-S2: la posesión del token de invitación acredita el email.
        emailVerifiedAt: expect.any(Date),
        credential: { create: { passwordHash: 'hashed-password' } },
      },
    });
    expect(tx.workshopRole.findUnique).toHaveBeenCalledWith({
      where: {
        workshopId_code: { workshopId: 'w1', code: 'owner' },
      },
      select: { id: true },
    });
    expect(tx.workshopMember.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workshopId: 'w1',
        userId: 'u-new',
        roleId: 'role-owner',
        status: 'active',
        joinedAt: expect.any(Date),
        invitedAt: baseInvitation.createdAt,
        acceptedAt: expect.any(Date),
      }),
      include: { role: { select: { code: true } } },
    });

    // Respuesta explícita sin token
    expect(result.workshop.status).toBe('active');
    expect(result.member.role).toEqual({ code: 'owner' });
    expect(JSON.stringify(result)).not.toContain('tok-1');

    // Eventos post-commit
    expect(permissionCacheMock.invalidateUser).toHaveBeenCalledWith('u-new');
    const emittedNames = eventEmitterMock.emit.mock.calls.map((c) => c[0]);
    expect(emittedNames).toContain('workshop.member.joined');
    expect(emittedNames).toContain('workshop.claimed');
    expect(emittedNames).toContain('auth.user.registered');
  });

  it('exige firstName/lastName/password para activar la cuenta pending (400 VALIDATION_ERROR)', async () => {
    setupHappyPath({ ...existingUser, status: 'pending' });

    await expect(
      handler.execute(
        new WizardClaimCommand({ token: 'tok-1', email: 'dueno@example.com' }),
      ),
    ).rejects.toMatchObject({ status: 400 });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('reactiva la cuenta pending, fija la credencial y NO emite user.registered', async () => {
    const tx = setupHappyPath({ ...existingUser, status: 'pending' });
    tx.user.update.mockResolvedValue({ ...existingUser, status: 'active' });

    await handler.execute(
      new WizardClaimCommand({
        token: 'tok-1',
        email: 'dueno@example.com',
        firstName: 'Dueño',
        lastName: 'Test',
        password: '12345678',
        phone: '011-1234',
      }),
    );

    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: {
        firstName: 'Dueño',
        lastName: 'Test',
        phone: '011-1234',
        status: 'active',
        // D-S2: la posesión del token de invitación acredita el email.
        emailVerifiedAt: expect.any(Date),
        credential: {
          upsert: {
            create: { passwordHash: 'hashed-password' },
            update: { passwordHash: 'hashed-password' },
          },
        },
      },
    });
    expect(tx.workshopMember.create).toHaveBeenCalled();
    const emittedNames = eventEmitterMock.emit.mock.calls.map((c) => c[0]);
    expect(emittedNames).not.toContain('auth.user.registered');
    expect(emittedNames).toContain('workshop.claimed');
  });

  it('exige sesión para cuenta activa (401 AUTH_REQUIRED)', async () => {
    setupHappyPath(existingUser);

    await expect(
      handler.execute(
        new WizardClaimCommand({ token: 'tok-1', email: 'dueno@example.com' }),
      ),
    ).rejects.toThrow(AuthRequiredException);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('rechaza con 403 si la sesión pertenece a otra cuenta', async () => {
    setupHappyPath(existingUser);

    await expect(
      handler.execute(
        new WizardClaimCommand(
          { token: 'tok-1', email: 'dueno@example.com' },
          'user-otro',
        ),
      ),
    ).rejects.toThrow(PermissionDeniedException);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('completa el onboarding para cuenta activa con sesión propia (sin crear/actualizar user)', async () => {
    const tx = setupHappyPath(existingUser);

    const result = await handler.execute(
      new WizardClaimCommand(
        { token: 'tok-1', email: 'dueno@example.com' },
        'u1',
      ),
    );

    expect(tx.user.create).not.toHaveBeenCalled();
    expect(tx.user.update).not.toHaveBeenCalled();
    expect(tx.workshopMember.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: 'u1', roleId: 'role-owner' }),
      include: { role: { select: { code: true } } },
    });
    expect(result.user.id).toBe('u1');
  });

  it('rechaza cuenta suspendida con 403', async () => {
    setupHappyPath({ ...existingUser, status: 'suspended' });

    await expect(
      handler.execute(
        new WizardClaimCommand({ token: 'tok-1', email: 'dueno@example.com' }),
      ),
    ).rejects.toThrow(PermissionDeniedException);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('protege el doble claim: updateMany con count 0 → 409 y no crea member', async () => {
    const tx = setupHappyPath(null);
    tx.user.create.mockResolvedValue({ ...existingUser, id: 'u-new' });
    tx.workshopInvitation.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      handler.execute(
        new WizardClaimCommand({
          token: 'tok-1',
          email: 'dueno@example.com',
          firstName: 'Dueño',
          lastName: 'Test',
          password: '12345678',
        }),
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect(tx.workshopMember.create).not.toHaveBeenCalled();
    expect(tx.user.create).not.toHaveBeenCalled();
    expect(eventEmitterMock.emit).not.toHaveBeenCalled();
  });

  it('rechaza con 409 explícito y mensaje claro si el email pertenece a una cuenta soft-deleted (D-S3)', async () => {
    prismaMock.workshopInvitation.findUnique.mockResolvedValue(baseInvitation);
    prismaMock.user.findFirst.mockResolvedValue({
      ...existingUser,
      deletedAt: new Date('2026-01-01T00:00:00Z'),
    });

    await expect(
      handler.execute(
        new WizardClaimCommand({
          token: 'tok-1',
          email: 'dueno@example.com',
          firstName: 'Dueño',
          lastName: 'Test',
          password: '12345678',
        }),
      ),
    ).rejects.toMatchObject({
      status: 409,
      message: expect.stringContaining('desactivada'),
    });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(eventEmitterMock.emit).not.toHaveBeenCalled();
  });
});