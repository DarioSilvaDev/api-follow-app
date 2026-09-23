import { ForbiddenException } from '@nestjs/common';
import { DealershipGuard } from './dealership.guard';
import { CurrentContext } from '../context/interfaces/current-context.interface';

/**
 * DealershipGuard — FIX-H2 (A2 §30 §2.6) y D-TL-12.
 *
 * Cubre el comportamiento del fallback params.id tras la restricción:
 * - contexto DEALERSHIP resuelto por ContextGuard → usa ctx.dealershipId;
 * - sin contexto → fallback params.id (rutas del panel /dealerships/:id/*);
 * - contexto PERSONAL explícito → fallback params.id (default del panel);
 * - contexto WORKSHOP/PLATFORM explícito → NO reinterpreta, 403;
 * - no miembro activo → 403.
 */
describe('DealershipGuard (FIX-H2 / A2)', () => {
  let guard: DealershipGuard;
  let prismaMock: { dealershipMember: { findUnique: jest.Mock } };

  const user = { id: 'user-1', email: 'member@test.com' };

  const activeMember = {
    id: 'member-1',
    status: 'active',
    roleId: 'role-1',
    dealership: { isActive: true },
  };

  function mockContext(
    ctx: CurrentContext | undefined,
    params: Record<string, string> = {},
  ) {
    const request: Record<string, unknown> = { user };
    if (ctx) request.context = ctx;
    request.params = params;
    return {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as Parameters<DealershipGuard['canActivate']>[0];
  }

  beforeEach(() => {
    prismaMock = { dealershipMember: { findUnique: jest.fn() } };
    guard = new DealershipGuard(prismaMock as any);
  });

  it('usa el dealershipId del contexto DEALERSHIP resuelto por ContextGuard (prelación header sobre params)', async () => {
    prismaMock.dealershipMember.findUnique.mockResolvedValue(activeMember);
    const ctx: CurrentContext = {
      type: 'DEALERSHIP',
      userId: 'user-1',
      dealershipId: 'd-ctx',
      memberId: 'member-1',
      roleId: 'role-1',
    };
    const context = mockContext(ctx, { id: 'd-params' });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(prismaMock.dealershipMember.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          dealershipId_userId: { dealershipId: 'd-ctx', userId: 'user-1' },
        },
      }),
    );
  });

  it('mantiene el fallback params.id cuando NO hay contexto (rutas del panel /dealerships/:id)', async () => {
    prismaMock.dealershipMember.findUnique.mockResolvedValue(activeMember);
    const context = mockContext(undefined, { id: 'd-params' });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(prismaMock.dealershipMember.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          dealershipId_userId: { dealershipId: 'd-params', userId: 'user-1' },
        },
      }),
    );
  });

  it('mantiene el fallback params.id cuando el contexto explícito es PERSONAL (default del panel)', async () => {
    prismaMock.dealershipMember.findUnique.mockResolvedValue(activeMember);
    const ctx: CurrentContext = { type: 'PERSONAL', userId: 'user-1' };
    const context = mockContext(ctx, { id: 'd-params' });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(prismaMock.dealershipMember.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          dealershipId_userId: { dealershipId: 'd-params', userId: 'user-1' },
        },
      }),
    );
  });

  it('NO reinterpreta un contexto WORKSHOP explícito usando params.id (FIX-H2 → 403)', async () => {
    const ctx: CurrentContext = {
      type: 'WORKSHOP',
      userId: 'user-1',
      workshopId: 'w1',
      memberId: 'm1',
      roleId: 'r1',
    };
    const context = mockContext(ctx, { id: 'd-params' });

    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
    expect(prismaMock.dealershipMember.findUnique).not.toHaveBeenCalled();
  });

  it('NO reinterpreta un contexto PLATFORM explícito usando params.id (FIX-H2 → 403)', async () => {
    const ctx: CurrentContext = { type: 'PLATFORM', userId: 'user-1' };
    const context = mockContext(ctx, { id: 'd-params' });

    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
    expect(prismaMock.dealershipMember.findUnique).not.toHaveBeenCalled();
  });

  it('rechaza a un usuario que no es miembro activo (403)', async () => {
    prismaMock.dealershipMember.findUnique.mockResolvedValue(null);
    const context = mockContext(undefined, { id: 'd-params' });

    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('rechaza a un miembro inactivo (403)', async () => {
    prismaMock.dealershipMember.findUnique.mockResolvedValue({
      id: 'member-1',
      status: 'inactive',
      roleId: 'role-1',
    });
    const context = mockContext(undefined, { id: 'd-params' });

    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('P2: rechaza a miembros de una concesionaria inactiva (403)', async () => {
    prismaMock.dealershipMember.findUnique.mockResolvedValue({
      ...activeMember,
      dealership: { isActive: false },
    });
    const context = mockContext(undefined, { id: 'd-params' });

    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
  });
});