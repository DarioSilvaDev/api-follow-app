import { ListCareEpisodesHandler } from './list-care-episodes.handler';

/**
 * ListCareEpisodesHandler — F-023 (RF-2/RF-4).
 *
 * El listado no tenía spec (hallazgo del review). Cubre las dos cosas que el
 * cambio de `serviceDate` (Plan 05 / B-TZ-7) puede romper:
 *   1. El orden canónico D-070 (`serviceDate ?? checkedInAt ?? createdAt` desc,
 *      tiebreak `createdAt` desc) — espejo de `sortCareEpisodes` de
 *      `get-vehicle-history.handler.ts`. NO se toca.
 *   2. `canonicalDateOnly` (aditivo): `YYYY-MM-DD`, `null` sii `serviceDate` es
 *      `null`; `canonicalDate` sigue siendo ISO completo.
 */
describe('ListCareEpisodesHandler — F-023 listado de atenciones', () => {
  let handler: ListCareEpisodesHandler;
  let prismaMock: {
    careEpisode: { count: jest.Mock; findMany: jest.Mock };
  };

  const workshopId = 'w-1';

  interface LightRow {
    id: string;
    serviceDate: Date | null;
    checkedInAt: Date | null;
    createdAt: Date;
  }

  function lightRow(
    id: string,
    serviceDate: Date | null,
    checkedInAt: Date | null,
    createdAt: Date,
  ): LightRow {
    return { id, serviceDate, checkedInAt, createdAt };
  }

  /** Detalle de la fase 2 (join de catálogo; mismo shape del `select`). */
  function detail(row: LightRow) {
    return {
      id: row.id,
      vehicleId: `v-${row.id}`,
      title: 'Cambio de aceite',
      status: 'delivered',
      source: 'owner',
      verification: 'unverified',
      serviceDate: row.serviceDate,
      mileageIn: 45200,
      checkedInAt: row.checkedInAt,
      createdAt: row.createdAt,
      vehicle: {
        licensePlate: 'ABC123',
        manufactureYear: 2020,
        brandName: 'Toyota',
        modelName: 'Corolla',
        version: {
          name: 'Corolla',
          model: { name: 'Corolla', brand: { name: 'Toyota' } },
        },
      },
    };
  }

  /**
   * Fase 1 (`Promise.all`: count + filas ligeras) y fase 2 (detalles de la
   * página, devueltos desordenados a propósito: el `in` de Prisma no preserva
   * orden y el handler re-ordena con el rank del sort D-070).
   */
  function mockTwoPhases(lightRows: LightRow[], detailOrder?: string[]) {
    prismaMock.careEpisode.count.mockResolvedValue(lightRows.length);
    const byId = new Map(lightRows.map((row) => [row.id, detail(row)]));
    const details = (detailOrder ?? lightRows.map((row) => row.id)).map((id) =>
      byId.get(id)!,
    );
    prismaMock.careEpisode.findMany
      .mockResolvedValueOnce(lightRows)
      .mockResolvedValueOnce(details);
  }

  beforeEach(() => {
    prismaMock = {
      careEpisode: { count: jest.fn(), findMany: jest.fn() },
    };
    handler = new ListCareEpisodesHandler(prismaMock as any);
  });

  // ──────────────────────────────────────────────────────
  // Orden canónico D-070 (protegido — NO cambiar)
  // ──────────────────────────────────────────────────────

  it('ordena por el coalesce D-070 desc (serviceDate ?? checkedInAt ?? createdAt) y re-ordena la fase 2', async () => {
    const a = lightRow(
      'ce-a',
      new Date('2026-10-10T00:00:00.000Z'),
      null,
      new Date('2026-10-10T08:00:00.000Z'),
    );
    const b = lightRow(
      'ce-b',
      null,
      new Date('2026-10-09T12:00:00.000Z'),
      new Date('2026-10-09T12:00:00.000Z'),
    );
    const c = lightRow(
      'ce-c',
      new Date('2026-10-09T09:00:00.000Z'),
      null,
      new Date('2026-10-08T09:00:00.000Z'),
    );
    const d = lightRow(
      'ce-d',
      null,
      null,
      new Date('2026-10-01T00:00:00.000Z'),
    );

    // Detalles en orden invertido: prueba el rank, no el orden de Prisma.
    mockTwoPhases([b, d, c, a], ['ce-d', 'ce-c', 'ce-b', 'ce-a']);

    const result = await handler.execute({ workshopId });

    expect(result.data.map((item) => item.id)).toEqual([
      'ce-a',
      'ce-b',
      'ce-c',
      'ce-d',
    ]);
    expect(result.data.map((item) => item.canonicalDate)).toEqual([
      '2026-10-10T00:00:00.000Z',
      '2026-10-09T12:00:00.000Z',
      '2026-10-09T09:00:00.000Z',
      '2026-10-01T00:00:00.000Z',
    ]);
    expect(result.meta).toEqual({
      total: 4,
      page: 1,
      limit: 20,
      totalPages: 1,
    });
  });

  it('desempata por createdAt desc cuando el timestamp canónico es igual', async () => {
    const canonical = new Date('2026-10-05T00:00:00.000Z');
    const older = lightRow(
      'ce-older',
      canonical,
      null,
      new Date('2026-10-06T10:00:00.000Z'),
    );
    const newer = lightRow(
      'ce-newer',
      canonical,
      null,
      new Date('2026-10-07T10:00:00.000Z'),
    );

    mockTwoPhases([older, newer], ['ce-older', 'ce-newer']);

    const result = await handler.execute({ workshopId });

    expect(result.data.map((item) => item.id)).toEqual([
      'ce-newer',
      'ce-older',
    ]);
  });

  // ──────────────────────────────────────────────────────
  // canonicalDateOnly (B-TZ-7) — aditivo
  // ──────────────────────────────────────────────────────

  it('canonicalDateOnly es YYYY-MM-DD derivado de serviceDate; null sii serviceDate es null', async () => {
    const withDate = lightRow(
      'ce-a',
      // 09:00Z (patrón del seed): el día calendario sigue siendo el 10.
      new Date('2026-10-10T09:00:00.000Z'),
      null,
      new Date('2026-10-10T09:00:00.000Z'),
    );
    const withoutDate = lightRow(
      'ce-b',
      null,
      new Date('2026-10-09T12:00:00.000Z'),
      new Date('2026-10-09T12:00:00.000Z'),
    );

    mockTwoPhases([withDate, withoutDate], ['ce-b', 'ce-a']);

    const result = await handler.execute({ workshopId });

    const [first, second] = result.data;

    expect(first.id).toBe('ce-a');
    expect(first.canonicalDateOnly).toBe('2026-10-10');
    expect(first.canonicalDateOnly).toHaveLength(10);
    expect(first.canonicalDateOnly).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // canonicalDate NO cambia: sigue siendo el instante ISO de orden D-070.
    expect(first.canonicalDate).toBe('2026-10-10T09:00:00.000Z');

    expect(second.id).toBe('ce-b');
    expect(second.canonicalDateOnly).toBeNull();
    // Sin serviceDate, el canónico sigue siendo checkedInAt (instante real).
    expect(second.canonicalDate).toBe('2026-10-09T12:00:00.000Z');
  });

  it('mantiene el contrato exhaustivo F-023: no expone serviceDate crudo ni PII', async () => {
    mockTwoPhases([
      lightRow(
        'ce-a',
        new Date('2026-10-10T00:00:00.000Z'),
        null,
        new Date('2026-10-10T00:00:00.000Z'),
      ),
    ]);

    const result = await handler.execute({ workshopId });

    expect(result.data[0]).not.toHaveProperty('serviceDate');
    expect(result.data[0]).not.toHaveProperty('checkedInAt');
    expect(result.data[0]).not.toHaveProperty('createdAt');
    expect(result.data[0]).not.toHaveProperty('customerNotes');
    expect(result.data[0]).not.toHaveProperty('internalNotes');
    expect(Object.keys(result.data[0]).sort()).toEqual(
      [
        'canonicalDate',
        'canonicalDateOnly',
        'id',
        'mileageIn',
        'source',
        'status',
        'title',
        'vehicle',
        'verification',
        'vehicleId',
      ].sort(),
    );
  });

  // ──────────────────────────────────────────────────────
  // q — búsqueda por patente (D-F023-1a, enmienda de D-F023-1)
  // ──────────────────────────────────────────────────────

  it('con `q` válida filtra Fase 1 (count + findMany) por patente, contains insensitive', async () => {
    mockTwoPhases([
      lightRow(
        'ce-a',
        new Date('2026-10-10T00:00:00.000Z'),
        null,
        new Date('2026-10-10T00:00:00.000Z'),
      ),
    ]);

    await handler.execute({ workshopId, q: '  smk ' });

    const expectedWhere = {
      workshopId,
      vehicle: { licensePlate: { contains: 'smk', mode: 'insensitive' } },
    };
    expect(prismaMock.careEpisode.count).toHaveBeenCalledWith({
      where: expectedWhere,
    });
    expect(prismaMock.careEpisode.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ where: expectedWhere }),
    );
    // Fase 2 sigue yendo por ids de la página.
    expect(prismaMock.careEpisode.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { id: { in: ['ce-a'] } } }),
    );
  });

  it.each([
    ['un carácter', 'S'],
    ['solo espacios', '   '],
    ['string vacío', ''],
    ['no-string (array de ?q=a&q=b)', 123 as unknown as string],
  ])('con `q` de %s se comporta como sin filtro', async (_label, q) => {
    mockTwoPhases([
      lightRow(
        'ce-a',
        new Date('2026-10-10T00:00:00.000Z'),
        null,
        new Date('2026-10-10T00:00:00.000Z'),
      ),
    ]);

    await handler.execute({ workshopId, q });

    expect(prismaMock.careEpisode.count).toHaveBeenCalledWith({
      where: { workshopId },
    });
    expect(prismaMock.careEpisode.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ where: { workshopId } }),
    );
  });

  it('recorta `q` a 20 caracteres (licensePlate @db.VarChar(20))', async () => {
    mockTwoPhases([
      lightRow(
        'ce-a',
        new Date('2026-10-10T00:00:00.000Z'),
        null,
        new Date('2026-10-10T00:00:00.000Z'),
      ),
    ]);

    await handler.execute({ workshopId, q: 'A'.repeat(25) });

    expect(prismaMock.careEpisode.count).toHaveBeenCalledWith({
      where: {
        workshopId,
        vehicle: {
          licensePlate: {
            contains: 'A'.repeat(20),
            mode: 'insensitive',
          },
        },
      },
    });
  });

  // ──────────────────────────────────────────────────────
  // Paginación / fase 2
  // ──────────────────────────────────────────────────────

  it('pide el detalle solo de los ids de la página y respeta page/limit', async () => {
    const rows = Array.from({ length: 5 }, (_, i) =>
      lightRow(
        `ce-${i}`,
        new Date(Date.UTC(2026, 9, 10 - i)),
        null,
        new Date(Date.UTC(2026, 9, 10 - i, 8)),
      ),
    );
    mockTwoPhases(rows, ['ce-3', 'ce-2']);

    const result = await handler.execute({ workshopId, page: 2, limit: 2 });

    expect(result.data.map((item) => item.id)).toEqual(['ce-2', 'ce-3']);
    expect(result.meta).toEqual({
      total: 5,
      page: 2,
      limit: 2,
      totalPages: 3,
    });
    expect(prismaMock.careEpisode.findMany).toHaveBeenCalledTimes(2);
    expect(prismaMock.careEpisode.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { id: { in: ['ce-2', 'ce-3'] } },
      }),
    );
  });

  it('devuelve página vacía sin fase 2 cuando el offset queda fuera de rango', async () => {
    mockTwoPhases([
      lightRow(
        'ce-a',
        new Date('2026-10-10T00:00:00.000Z'),
        null,
        new Date('2026-10-10T00:00:00.000Z'),
      ),
    ]);

    const result = await handler.execute({ workshopId, page: 3, limit: 20 });

    expect(result.data).toEqual([]);
    expect(result.meta).toEqual({
      total: 1,
      page: 3,
      limit: 20,
      totalPages: 1,
    });
    expect(prismaMock.careEpisode.findMany).toHaveBeenCalledTimes(1);
  });
});
