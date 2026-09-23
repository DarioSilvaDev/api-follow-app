import { ForbiddenException } from '@nestjs/common';
import { DealershipOnlyGuard } from './dealership-only.guard';

/**
 * DealershipOnlyGuard — P2 (isActive) + contexto obligatorio DEALERSHIP.
 *
 * Cubre:
 * - sin contexto / contexto PERSONAL / WORKSHOP → 403 (sin consulta);
 * - contexto DEALERSHIP con concesionaria activa → true;
 * - concesionaria inactiva → 403;
 * - concesionaria inexistente (soft-delete) → 403 (fail-closed).
 */
describe('DealershipOnlyGuard (P2)', () => {
  let guard: DealershipOnlyGuard;
  let prismaMock: { dealership: { findUnique: jest.Mock } };

  const dealershipCtx = {
    type: 'DEALERSHIP',
    dealershipId: 'd1',
    userId: 'u1',
    memberId: 'm1',
    roleId: 'r1',
  };

  function mockContext(ctx: unknown) {
    const request: Record<string, unknown> = {};
    if (ctx !== undefined) request.context = ctx;
    return {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as Parameters<DealershipOnlyGuard['canActivate']>[0];
  }

  beforeEach(() => {
    prismaMock = { dealership: { findUnique: jest.fn() } };
    guard = new DealershipOnlyGuard(prismaMock as any);
  });

  it('acepta contexto DEALERSHIP con concesionaria activa', async () => {
    prismaMock.dealership.findUnique.mockResolvedValue({ isActive: true });

    await expect(guard.canActivate(mockContext(dealershipCtx))).resolves.toBe(
      true,
    );
    expect(prismaMock.dealership.findUnique).toHaveBeenCalledWith({
      where: { id: 'd1' },
      select: { isActive: true },
    });
  });

  it('sin contexto → 403 sin consultar la base', async () => {
    await expect(guard.canActivate(mockContext(undefined))).rejects.toThrow(
      ForbiddenException,
    );
    expect(prismaMock.dealership.findUnique).not.toHaveBeenCalled();
  });

  it('contexto PERSONAL → 403 sin consultar la base', async () => {
    const ctx = { type: 'PERSONAL', userId: 'u1' };

    await expect(guard.canActivate(mockContext(ctx))).rejects.toThrow(
      ForbiddenException,
    );
    expect(prismaMock.dealership.findUnique).not.toHaveBeenCalled();
  });

  it('contexto WORKSHOP → 403 sin consultar la base', async () => {
    const ctx = { type: 'WORKSHOP', userId: 'u1', workshopId: 'w1' };

    await expect(guard.canActivate(mockContext(ctx))).rejects.toThrow(
      ForbiddenException,
    );
    expect(prismaMock.dealership.findUnique).not.toHaveBeenCalled();
  });

  it('P2: concesionaria inactiva → 403', async () => {
    prismaMock.dealership.findUnique.mockResolvedValue({ isActive: false });

    await expect(guard.canActivate(mockContext(dealershipCtx))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('P2: concesionaria inexistente → 403 (fail-closed)', async () => {
    prismaMock.dealership.findUnique.mockResolvedValue(null);

    await expect(guard.canActivate(mockContext(dealershipCtx))).rejects.toThrow(
      ForbiddenException,
    );
  });
});
