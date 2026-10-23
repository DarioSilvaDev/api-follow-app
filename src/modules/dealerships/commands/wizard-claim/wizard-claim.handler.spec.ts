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

describe('WizardClaimHandler — D-106 claim del wizard de onboarding', () => {
  let handler: WizardClaimHandler;
  let prismaMock: {
    dealershipInvitation: { findUnique: jest.Mock };
    user: { findFirst: jest.Mock };
    $transaction: jest.Mock;
  };
  let eventEmitterMock: { emit: jest.Mock };
  let permissionCacheMock: { invalidateUser: jest.Mock };

  const baseInvitation = {
    id: 'inv-1',
    dealershipId: 'd1',
    email: 'dueno@example.com',
    token: 'tok-1',
    status: 'pending',
    expiresAt: new Date(Date.now() + 100000),
    createdAt: new Date('2026-01-01T00:00:00Z'),
    dealership: {
      id: 'd1',
      name: 'Concesionaria Norte',
      status: 'pending_claim',
      workshop: null,
    },
  };

  /** D-TL-4: invitación con taller vinculado (alta conjunta). */
  const groupInvitation = () => ({
    ...baseInvitation,
    dealership: {
      id: 'd1',
      name: 'Concesionaria Norte',
      status: 'pending_claim',
      workshop: {
        id: 'w1',
        name: 'Concesionaria Norte Service',
        status: 'pending_claim',
      },
    },
  });

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
    dealershipInvitation: { updateMany: jest.fn() },
    dealership: { updateMany: jest.fn(), findUniqueOrThrow: jest.fn() },
    user: { create: jest.fn(), update: jest.fn() },
    dealershipRole: { findUnique: jest.fn() },
    dealershipMember: { create: jest.fn() },
    workshop: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      updateMany: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
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
      dealershipInvitation: { findUnique: jest.fn() },
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
    prismaMock.dealershipInvitation.findUnique.mockResolvedValue(
      baseInvitation,
    );
    prismaMock.user.findFirst.mockResolvedValue(user);
    const tx = makeTxMock();
    tx.dealershipInvitation.updateMany.mockResolvedValue({ count: 1 });
    tx.dealership.updateMany.mockResolvedValue({ count: 1 });
    tx.dealershipRole.findUnique.mockResolvedValue({
      id: 'role-owner',
      code: 'owner',
    });
    tx.dealershipMember.create.mockResolvedValue({
      id: 'member-1',
      dealershipId: 'd1',
      userId: user?.id ?? 'u-new',
      role: { code: 'owner' },
    });
    tx.dealership.findUniqueOrThrow.mockResolvedValue({
      id: 'd1',
      name: 'Concesionaria Norte',
      status: 'active',
      email: 'dueno@example.com',
      phone: null,
      website: null,
      description: null,
    });
    if (txOverrides.dealershipInvitation) {
      tx.dealershipInvitation = txOverrides.dealershipInvitation;
    }
    if (txOverrides.dealership) {
      tx.dealership = txOverrides.dealership;
    }
    registerTx(tx);
    return tx;
  };

  /**
   * D-TL-4: setup del claim CONJUNTO (invitación con taller vinculado).
   * Estado por defecto del taller: pending_claim, sin dedupes conflictivos,
   * updateMany exitoso y owner role presente.
   */
  const setupGroupClaim = (user: object | null = null) => {
    prismaMock.dealershipInvitation.findUnique.mockResolvedValue(
      groupInvitation(),
    );
    prismaMock.user.findFirst.mockResolvedValue(user);
    const tx = makeTxMock();
    tx.dealershipInvitation.updateMany.mockResolvedValue({ count: 1 });
    tx.dealership.updateMany.mockResolvedValue({ count: 1 });
    tx.dealershipRole.findUnique.mockResolvedValue({
      id: 'role-owner',
      code: 'owner',
    });
    // Default para el flujo de cuenta nueva (user=null): los tests que
    // necesiten otro user.id sobrescriben después de `setupGroupClaim`.
    tx.user.create.mockResolvedValue({
      id: 'u-new',
      email: 'dueno@example.com',
      firstName: 'Dueño',
      lastName: 'Test',
      phone: null,
      status: 'active',
    });
    tx.dealershipMember.create.mockResolvedValue({
      id: 'member-d1',
      dealershipId: 'd1',
      userId: user?.id ?? 'u-new',
      role: { code: 'owner' },
    });
    tx.dealership.findUniqueOrThrow.mockResolvedValue({
      id: 'd1',
      name: 'Concesionaria Norte',
      status: 'active',
      email: 'dueno@example.com',
      phone: null,
      website: null,
      description: null,
    });
    tx.workshop.findFirst.mockResolvedValue(null);
    tx.workshop.findUnique.mockResolvedValue(null);
    tx.workshop.updateMany.mockResolvedValue({ count: 1 });
    tx.workshopRole.findUnique.mockResolvedValue({
      id: 'role-wowner',
      code: 'owner',
    });
    tx.workshopMember.create.mockResolvedValue({
      id: 'member-w1',
      workshopId: 'w1',
      userId: user?.id ?? 'u-new',
      role: { code: 'owner' },
    });
    tx.workshop.findUniqueOrThrow.mockResolvedValue({
      id: 'w1',
      name: 'Taller Centro Service',
      status: 'active',
      email: 'taller@example.com',
      phone: '011-5555',
      website: 'www.taller.com',
      description: 'Taller oficial',
    });
    registerTx(tx);
    return tx;
  };

  it('rechaza token inexistente con 404 INVITATION_INVALID', async () => {
    prismaMock.dealershipInvitation.findUnique.mockResolvedValue(null);

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
    prismaMock.dealershipInvitation.findUnique.mockResolvedValue({
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
    prismaMock.dealershipInvitation.findUnique.mockResolvedValue({
      ...baseInvitation,
      status: 'accepted',
    });
    await expect(
      handler.execute(
        new WizardClaimCommand({ token: 'tok-1', email: 'dueno@example.com' }),
      ),
    ).rejects.toMatchObject({ status: 409 });

    prismaMock.dealershipInvitation.findUnique.mockResolvedValue({
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
    prismaMock.dealershipInvitation.findUnique.mockResolvedValue(
      baseInvitation,
    );

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
        dealership: { phone: '011-9999', website: 'www.autos.com' },
      }),
    );

    // Transaction: invitación aceptada + dealership activa con claimedAt
    expect(tx.dealershipInvitation.updateMany).toHaveBeenCalledWith({
      where: { id: 'inv-1', status: 'pending' },
      data: { status: 'accepted', acceptedAt: expect.any(Date) },
    });
    expect(tx.dealership.updateMany).toHaveBeenCalledWith({
      where: { id: 'd1', status: 'pending_claim' },
      data: expect.objectContaining({
        status: 'active',
        claimedAt: expect.any(Date),
        phone: '011-9999',
        website: 'www.autos.com',
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
    expect(tx.dealershipMember.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        dealershipId: 'd1',
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
    expect(result.dealership.status).toBe('active');
    expect(result.member.role).toEqual({ code: 'owner' });
    expect(JSON.stringify(result)).not.toContain('tok-1');

    // Eventos post-commit
    expect(permissionCacheMock.invalidateUser).toHaveBeenCalledWith('u-new');
    const emittedNames = eventEmitterMock.emit.mock.calls.map((c) => c[0]);
    expect(emittedNames).toContain('dealership.member.joined');
    expect(emittedNames).toContain('dealership.claimed');
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
    const tx = setupHappyPath({
      ...existingUser,
      status: 'pending',
    });
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
    expect(tx.dealershipMember.create).toHaveBeenCalled();
    const emittedNames = eventEmitterMock.emit.mock.calls.map((c) => c[0]);
    expect(emittedNames).not.toContain('auth.user.registered');
    expect(emittedNames).toContain('dealership.claimed');
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
    expect(tx.dealershipMember.create).toHaveBeenCalledWith({
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
    tx.dealershipInvitation.updateMany.mockResolvedValue({ count: 0 });

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
    // El guard transaccional: la excepción lanzada dentro de $transaction cancela
    // el commit (no llegan member ni user).
    expect(tx.dealershipMember.create).not.toHaveBeenCalled();
    expect(tx.user.create).not.toHaveBeenCalled();
    expect(eventEmitterMock.emit).not.toHaveBeenCalled();
  });

  it('rechaza con 409 explícito y mensaje claro si el email pertenece a una cuenta soft-deleted (D-S3)', async () => {
    prismaMock.dealershipInvitation.findUnique.mockResolvedValue(
      baseInvitation,
    );
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
    // NO llega a la transacción: no crea user ni member, ni emite eventos.
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(eventEmitterMock.emit).not.toHaveBeenCalled();
  });

  it('AC-4: claim conjunto con cuenta nueva → 2 membresías owner, ambas entidades active+claimedAt y eventos post-commit', async () => {
    const tx = setupGroupClaim(null);
    tx.user.create.mockResolvedValue({
      id: 'u-new',
      email: 'dueno@example.com',
      firstName: 'Dueño',
      lastName: 'Test',
      phone: null,
      status: 'active',
    });

    const result = await handler.execute(
      new WizardClaimCommand({
        token: 'tok-1',
        email: 'dueno@example.com',
        firstName: 'Dueño',
        lastName: 'Test',
        password: '12345678',
        dealership: { phone: '011-9999' },
        workshop: {
          name: 'Concesionaria Norte Service',
          taxId: '30-72010031-5',
          email: 'taller@example.com',
          phone: '011-5555',
          website: 'www.taller.com',
          description: 'Taller oficial',
        },
      }),
    );

    // Importación del include del taller en el lookup (D-TL-4).
    const lookupArgs =
      prismaMock.dealershipInvitation.findUnique.mock.calls[0][0];
    expect(lookupArgs.include.dealership.select.workshop).toEqual({
      select: { id: true, name: true, status: true },
    });

    // Ambas entidades se reclaman en la MISMA $transaction.
    expect(tx.dealership.updateMany).toHaveBeenCalledWith({
      where: { id: 'd1', status: 'pending_claim' },
      data: expect.objectContaining({
        status: 'active',
        claimedAt: expect.any(Date),
        phone: '011-9999',
      }),
    });
    expect(tx.workshop.updateMany).toHaveBeenCalledWith({
      where: { id: 'w1', status: 'pending_claim' },
      data: expect.objectContaining({
        status: 'active',
        claimedAt: expect.any(Date),
        name: 'Concesionaria Norte Service',
        taxId: '30720100315', // CUIT normalizado solo dígitos
        email: 'taller@example.com',
        phone: '011-5555',
        website: 'www.taller.com',
        description: 'Taller oficial',
      }),
    });

    // 2 membresías owner.
    expect(tx.dealershipMember.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        dealershipId: 'd1',
        userId: 'u-new',
        roleId: 'role-owner',
        status: 'active',
        joinedAt: expect.any(Date),
        invitedAt: baseInvitation.createdAt,
        acceptedAt: expect.any(Date),
      }),
      include: { role: { select: { code: true } } },
    });
    expect(tx.workshopMember.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workshopId: 'w1',
        userId: 'u-new',
        roleId: 'role-wowner',
        status: 'active',
        joinedAt: expect.any(Date),
        invitedAt: baseInvitation.createdAt,
        acceptedAt: expect.any(Date),
      }),
    });

    // Respuesta incluye workshop persistido.
    expect(result.workshop).toEqual({
      id: 'w1',
      name: 'Taller Centro Service',
      status: 'active',
      email: 'taller@example.com',
      phone: '011-5555',
      website: 'www.taller.com',
      description: 'Taller oficial',
    });

    // Eventos post-commit (D-TL-4): dealership + workshop + user.registered.
    expect(permissionCacheMock.invalidateUser).toHaveBeenCalledWith('u-new');
    const emittedNames = eventEmitterMock.emit.mock.calls.map((c) => c[0]);
    expect(emittedNames).toContain('dealership.member.joined');
    expect(emittedNames).toContain('dealership.claimed');
    expect(emittedNames).toContain('workshop.member.joined');
    expect(emittedNames).toContain('workshop.claimed');
    expect(emittedNames).toContain('auth.user.registered');
  });

  it('AC-4b: claim conjunto con cuenta activa y sesión del dueño → mismas membresías, sin auth.user.registered', async () => {
    const tx = setupGroupClaim(existingUser);
    tx.workshop.findUniqueOrThrow.mockResolvedValue({
      id: 'w1',
      name: 'Taller Centro Service',
      status: 'active',
      email: null,
      phone: null,
      website: null,
      description: null,
    });

    const result = await handler.execute(
      new WizardClaimCommand(
        {
          token: 'tok-1',
          email: 'dueno@example.com',
          workshop: { name: 'Taller Centro Service' },
        },
        'u1',
      ),
    );

    expect(tx.user.create).not.toHaveBeenCalled();
    expect(tx.user.update).not.toHaveBeenCalled();
    expect(tx.workshopMember.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: 'u1', roleId: 'role-wowner' }),
    });
    expect(result.workshop).toBeDefined();
    const emittedNames = eventEmitterMock.emit.mock.calls.map((c) => c[0]);
    expect(emittedNames).not.toContain('auth.user.registered');
    expect(emittedNames).toContain('workshop.claimed');
  });

  it('AC-4c: claim conjunto con cuenta pending → reactivación + 2 membresías', async () => {
    const tx = setupGroupClaim({ ...existingUser, status: 'pending' });
    tx.user.update.mockResolvedValue({ ...existingUser, status: 'active' });
    tx.workshop.findUniqueOrThrow.mockResolvedValue({
      id: 'w1',
      name: 'Taller Centro Service',
      status: 'active',
      email: null,
      phone: null,
      website: null,
      description: null,
    });

    await handler.execute(
      new WizardClaimCommand({
        token: 'tok-1',
        email: 'dueno@example.com',
        firstName: 'Dueño',
        lastName: 'Test',
        password: '12345678',
        workshop: { name: 'Taller Centro Service' },
      }),
    );

    expect(tx.user.update).toHaveBeenCalled();
    expect(tx.workshopMember.create).toHaveBeenCalled();
    const emittedNames = eventEmitterMock.emit.mock.calls.map((c) => c[0]);
    expect(emittedNames).not.toContain('auth.user.registered');
    expect(emittedNames).toContain('workshop.claimed');
  });

  it('AC-5: doble claim del taller (workshop ya reclamado) → 409 y NINGÚN cambio parcial', async () => {
    const tx = setupGroupClaim(null);
    tx.user.create.mockResolvedValue({
      id: 'u-new',
      email: 'dueno@example.com',
      firstName: 'Dueño',
      lastName: 'Test',
      phone: null,
      status: 'active',
    });
    // El taller ya fue reclamado en otro intento: updateMany count 0.
    tx.workshop.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      handler.execute(
        new WizardClaimCommand({
          token: 'tok-1',
          email: 'dueno@example.com',
          firstName: 'Dueño',
          lastName: 'Test',
          password: '12345678',
          workshop: { name: 'Concesionaria Norte Service' },
        }),
      ),
    ).rejects.toMatchObject({ status: 409 });

    // Rollback: no se creó la membresía del taller ni se emitieron eventos
    // (entidades siguen pending_claim en BD — la tx no commitea).
    expect(tx.workshopMember.create).not.toHaveBeenCalled();
    expect(eventEmitterMock.emit).not.toHaveBeenCalled();
  });

  it('AC-6: taller con nombre duplicado → 409 y ROLLBACK (sin patch ni membresía)', async () => {
    const tx = setupGroupClaim(null);
    tx.user.create.mockResolvedValue({
      id: 'u-new',
      email: 'dueno@example.com',
      firstName: 'Dueño',
      lastName: 'Test',
      phone: null,
      status: 'active',
    });
    tx.workshop.findFirst.mockResolvedValue({ id: 'w-otro' }); // nombre duplicado

    await expect(
      handler.execute(
        new WizardClaimCommand({
          token: 'tok-1',
          email: 'dueno@example.com',
          firstName: 'Dueño',
          lastName: 'Test',
          password: '12345678',
          workshop: { name: 'Concesionaria Norte Service' },
        }),
      ),
    ).rejects.toMatchObject({
      status: 409,
      message: expect.stringContaining('nombre'),
    });

    expect(tx.workshop.updateMany).not.toHaveBeenCalled();
    expect(tx.workshopMember.create).not.toHaveBeenCalled();
    expect(tx.workshop.findUniqueOrThrow).not.toHaveBeenCalled();
    expect(eventEmitterMock.emit).not.toHaveBeenCalled();
  });

  it('AC-6: taller con CUIT duplicado → 409 y ROLLBACK', async () => {
    const tx = setupGroupClaim(null);
    tx.user.create.mockResolvedValue({
      id: 'u-new',
      email: 'dueno@example.com',
      firstName: 'Dueño',
      lastName: 'Test',
      phone: null,
      status: 'active',
    });
    tx.workshop.findFirst.mockResolvedValue(null);
    tx.workshop.findUnique.mockResolvedValue({ id: 'w-cuit' }); // CUIT duplicado

    await expect(
      handler.execute(
        new WizardClaimCommand({
          token: 'tok-1',
          email: 'dueno@example.com',
          firstName: 'Dueño',
          lastName: 'Test',
          password: '12345678',
          workshop: {
            name: 'Concesionaria Norte Service',
            taxId: '30-72010031-5',
          },
        }),
      ),
    ).rejects.toMatchObject({
      status: 409,
      message: expect.stringContaining('CUIT'),
    });

    expect(tx.workshop.updateMany).not.toHaveBeenCalled();
    expect(tx.workshopMember.create).not.toHaveBeenCalled();
    expect(eventEmitterMock.emit).not.toHaveBeenCalled();
  });

  it('400 VALIDATION_ERROR si el token es conjunto y NO se envía el bloque workshop', async () => {
    const tx = setupGroupClaim(null);

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
      status: 400,
      message: expect.stringContaining('nombre del taller'),
    });

    expect(tx.workshop.updateMany).not.toHaveBeenCalled();
    expect(eventEmitterMock.emit).not.toHaveBeenCalled();
  });

  it('400 VALIDATION_ERROR si el nombre del taller llega vacío (solo espacios)', async () => {
    const tx = setupGroupClaim(null);

    await expect(
      handler.execute(
        new WizardClaimCommand({
          token: 'tok-1',
          email: 'dueno@example.com',
          firstName: 'Dueño',
          lastName: 'Test',
          password: '12345678',
          workshop: { name: '   ' },
        }),
      ),
    ).rejects.toMatchObject({
      status: 400,
      message: expect.stringContaining('nombre del taller'),
    });

    expect(tx.workshop.updateMany).not.toHaveBeenCalled();
    expect(eventEmitterMock.emit).not.toHaveBeenCalled();
  });

  it('D-S3: cuenta soft-deleted con claim conjunto → 409 y NO toca el taller', async () => {
    prismaMock.dealershipInvitation.findUnique.mockResolvedValue(
      groupInvitation(),
    );
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
          workshop: { name: 'Concesionaria Norte Service' },
        }),
      ),
    ).rejects.toMatchObject({
      status: 409,
      message: expect.stringContaining('desactivada'),
    });

    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(eventEmitterMock.emit).not.toHaveBeenCalled();
  });

  it('regresión: claim simple (sin taller vinculado) → respuesta SIN campo workshop', async () => {
    const tx = setupHappyPath(null);
    tx.user.create.mockResolvedValue({
      id: 'u-new',
      email: 'dueno@example.com',
      firstName: 'Dueño',
      lastName: 'Test',
      phone: null,
      status: 'active',
    });

    const result = await handler.execute(
      new WizardClaimCommand({
        token: 'tok-1',
        email: 'dueno@example.com',
        firstName: 'Dueño',
        lastName: 'Test',
        password: '12345678',
      }),
    );

    expect(result).not.toHaveProperty('workshop');
    expect(tx.workshopMember.create).not.toHaveBeenCalled();
    const emittedNames = eventEmitterMock.emit.mock.calls.map((c) => c[0]);
    expect(emittedNames).not.toContain('workshop.claimed');
    expect(emittedNames).toContain('dealership.claimed');
  });
});
