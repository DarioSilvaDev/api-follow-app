import { BadRequestException } from '@nestjs/common';
import { ListClaimsHandler } from './list-claims.handler';

describe('ListClaimsHandler — paginación, filtro y counts efectivos', () => {
  let handler: ListClaimsHandler;
  let prisma: { vehicleClaimInvite: { findMany: jest.Mock } };

  const workshopId = '33333333-3333-3333-3333-333333333333';
  const future = new Date(Date.now() + 7 * 24 * 3600 * 1000);
  const past = new Date(Date.now() - 1000);

  const rows = [
    {
      id: 'a',
      status: 'pending',
      expiresAt: future,
      createdAt: new Date('2026-11-04T10:00:00.000Z'),
    },
    {
      id: 'b',
      status: 'pending',
      expiresAt: past,
      createdAt: new Date('2026-11-03T10:00:00.000Z'),
    },
    {
      id: 'c',
      status: 'claimed',
      expiresAt: future,
      createdAt: new Date('2026-11-02T10:00:00.000Z'),
    },
    {
      id: 'd',
      status: 'revoked',
      expiresAt: future,
      createdAt: new Date('2026-11-01T10:00:00.000Z'),
    },
  ];

  function detail(row: (typeof rows)[number]) {
    return {
      ...row,
      vehicleId: 'vehicle-1',
      claimOutcome: null,
      ownerPhone: null,
      openedAt: null,
      verifiedAt: null,
      usedAt: null,
      failedAttempts: 0,
      updatedAt: row.createdAt,
      vehicle: { licensePlate: `PLATE-${row.id}` },
    };
  }

  beforeEach(() => {
    prisma = { vehicleClaimInvite: { findMany: jest.fn() } };
    prisma.vehicleClaimInvite.findMany.mockImplementation(
      ({ where }: { where: { id?: { in: string[] } } }) => {
        if (where.id) {
          return Promise.resolve(
            rows.filter((row) => where.id!.in.includes(row.id)).map(detail),
          );
        }
        return Promise.resolve(rows);
      },
    );
    handler = new ListClaimsHandler(prisma as never);
  });

  it('calcula counts por estado EFECTIVO (pending vencido cuenta como expired)', async () => {
    const result = await handler.execute({ workshopId });

    expect(result.meta.counts).toEqual({
      pending: 1,
      verification_required: 0,
      verified: 0,
      manual_review: 0,
      claimed: 1,
      claim_blocked: 0,
      expired: 1,
      revoked: 1,
    });
  });

  it('ordena createdAt desc, pagina y trae el detalle sólo de la página', async () => {
    const result = await handler.execute({ workshopId, page: 1, limit: 2 });

    expect(result.meta).toMatchObject({
      total: 4,
      page: 1,
      limit: 2,
      totalPages: 2,
    });
    expect(result.data.map((item) => item.id)).toEqual(['a', 'b']);
    expect(result.data[0].licensePlate).toBe('PLATE-a');
    expect(prisma.vehicleClaimInvite.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { id: { in: ['a', 'b'] } } }),
    );
  });

  it('la segunda página devuelve las filas restantes', async () => {
    const result = await handler.execute({ workshopId, page: 2, limit: 2 });

    expect(result.data.map((item) => item.id)).toEqual(['c', 'd']);
  });

  it('filtra por estado efectivo expired', async () => {
    const result = await handler.execute({ workshopId, status: 'expired' });

    expect(result.meta.total).toBe(1);
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({ id: 'b', status: 'expired' });
  });

  it('filtra por estado terminal claimed', async () => {
    const result = await handler.execute({ workshopId, status: 'claimed' });

    expect(result.data.map((item) => item.id)).toEqual(['c']);
  });

  it('página fuera de rango → data vacía con meta consistente', async () => {
    const result = await handler.execute({ workshopId, page: 9, limit: 20 });

    expect(result.data).toEqual([]);
    expect(result.meta).toMatchObject({ total: 4, page: 9, totalPages: 1 });
  });

  it('clamp de limit a MAX_PAGE_SIZE y default a DEFAULT_PAGE_SIZE', async () => {
    const clamped = await handler.execute({ workshopId, limit: 999 });
    expect(clamped.meta.limit).toBe(100);

    const defaulted = await handler.execute({ workshopId });
    expect(defaulted.meta.limit).toBe(20);
    expect(defaulted.meta.page).toBe(1);
  });

  it('status inválido → 400', async () => {
    await expect(
      handler.execute({ workshopId, status: 'nope' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
