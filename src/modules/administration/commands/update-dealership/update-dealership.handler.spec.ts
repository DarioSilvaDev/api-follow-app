import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import { CodedHttpException } from '../../../../common/exceptions/coded.exception';
import { ERROR_CODES } from '../../../../common/exceptions/error-codes';
import { UpdateDealershipHandler } from './update-dealership.handler';
import { UpdateDealershipCommand } from './update-dealership.command';

/**
 * P1: edición admin de identidad/contacto de la concesionaria.
 *
 * Cubre: happy path (trim + lowercase + changes), limpieza con null,
 * 404 inexistente/soft-delete, name vacío → 400, dedupe de nombre (409),
 * dedupe de CUIT (409), CUIT bloqueado (409 + `DEALERSHIP_CUIT_LOCKED`) con
 * excepción super_admin, CUIT sin cambio → no-op, no-op sin cambios (sin
 * update ni evento), mass-assignment ignorada (ownerEmail) y red P2002 → 409.
 */
describe('UpdateDealershipHandler (admin) — P1 edición identidad/contacto', () => {
  let handler: UpdateDealershipHandler;
  let prismaMock: any;
  let eventEmitterMock: { emit: jest.Mock };

  const adminUser = { id: 'admin-1', email: 'admin@test.com' };

  const baseDealership = {
    id: 'd1',
    name: 'Concesionaria Norte',
    legalName: null,
    taxId: null,
    email: null,
    phone: null,
    website: null,
    description: null,
    status: 'pending_claim',
    isActive: true,
    claimedAt: null,
    deletedAt: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  };

  const adminAssignments = [{ role: { type: 'admin', priority: 80 } }];
  const superAdminAssignments = [
    { role: { type: 'super_admin', priority: 100 } },
  ];

  beforeEach(() => {
    prismaMock = {
      dealership: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      systemRoleAssignment: { findMany: jest.fn() },
    };
    eventEmitterMock = { emit: jest.fn() };
    handler = new UpdateDealershipHandler(
      prismaMock,
      eventEmitterMock as unknown as EventEmitter2,
    );

    // findUnique({ where: { id } }) → existente; findUnique({ where: { taxId } })
    // → sin choque por defecto.
    prismaMock.dealership.findUnique.mockImplementation((args: any) => {
      if (args.where.id) return Promise.resolve({ ...baseDealership });
      return Promise.resolve(null);
    });
    prismaMock.dealership.findFirst.mockResolvedValue(null);
    prismaMock.dealership.update.mockImplementation(
      async ({ data }: any) => Promise.resolve({ ...baseDealership, ...data }),
    );
    prismaMock.systemRoleAssignment.findMany.mockResolvedValue(
      adminAssignments,
    );
  });

  const execute = (dto: any, user = adminUser) =>
    handler.execute(new UpdateDealershipCommand('d1', dto), user);

  it('happy path: trim de nombre, lowercase de email, solo campos enviados + evento con changes', async () => {
    const dto = {
      name: '  Concesionaria Sur  ',
      phone: '1122334455',
      email: 'Contacto@Example.COM',
    };

    await execute(dto);

    expect(prismaMock.dealership.update).toHaveBeenCalledWith({
      where: { id: 'd1' },
      data: {
        name: 'Concesionaria Sur',
        phone: '1122334455',
        email: 'contacto@example.com',
      },
    });
    expect(eventEmitterMock.emit).toHaveBeenCalledWith(
      'admin.dealership.updated',
      expect.objectContaining({
        dealershipId: 'd1',
        updatedById: 'admin-1',
        updatedByRole: 'admin',
        changes: {
          name: {
            from: 'Concesionaria Norte',
            to: 'Concesionaria Sur',
          },
          phone: { from: null, to: '1122334455' },
          email: { from: null, to: 'contacto@example.com' },
        },
      }),
    );
  });

  it('limpieza con null: vacía campos opcionales con valor', async () => {
    prismaMock.dealership.findUnique.mockImplementation(() =>
      Promise.resolve({
        ...baseDealership,
        legalName: 'Razón Vieja SA',
        description: 'desc',
      }),
    );

    await execute({ legalName: null, description: null });

    expect(prismaMock.dealership.update).toHaveBeenCalledWith({
      where: { id: 'd1' },
      data: { legalName: null, description: null },
    });
  });

  it('404: concesionaria inexistente', async () => {
    prismaMock.dealership.findUnique.mockResolvedValue(null);

    await expect(execute({ name: 'X' })).rejects.toThrow(NotFoundException);
    expect(prismaMock.dealership.update).not.toHaveBeenCalled();
  });

  it('404: concesionaria soft-deleteada', async () => {
    prismaMock.dealership.findUnique.mockResolvedValue({
      ...baseDealership,
      deletedAt: new Date(),
    });

    await expect(execute({ name: 'X' })).rejects.toThrow(NotFoundException);
    expect(prismaMock.dealership.update).not.toHaveBeenCalled();
  });

  it('400: nombre vacío o null', async () => {
    await expect(execute({ name: '   ' })).rejects.toThrow(
      BadRequestException,
    );
    await expect(execute({ name: null })).rejects.toThrow(
      BadRequestException,
    );
    expect(prismaMock.dealership.update).not.toHaveBeenCalled();
  });

  it('409: nombre duplicado (case-insensitive, excluye self)', async () => {
    prismaMock.dealership.findFirst.mockResolvedValue({ id: 'other' });

    await expect(execute({ name: 'otra concesionaria' })).rejects.toThrow(
      CodedHttpException,
    );
    try {
      await execute({ name: 'otra concesionaria' });
    } catch (err) {
      const coded = err as CodedHttpException;
      expect(coded.getCode()).toBe(ERROR_CODES.CONFLICT);
      expect(coded.getCode()).not.toBe(ERROR_CODES.DEALERSHIP_CUIT_LOCKED);
      expect(coded.message).toContain('nombre');
    }
    expect(prismaMock.dealership.update).not.toHaveBeenCalled();
    expect(eventEmitterMock.emit).not.toHaveBeenCalled();
  });

  it('409: CUIT duplicado', async () => {
    prismaMock.dealership.findUnique.mockImplementation((args: any) => {
      if (args.where.id) return Promise.resolve({ ...baseDealership });
      return Promise.resolve({ id: 'other' });
    });

    let thrown: any;
    try {
      await execute({ taxId: '30-99999999-9' });
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(CodedHttpException);
    expect(thrown.getCode()).toBe(ERROR_CODES.CONFLICT);
    expect(thrown.getCode()).not.toBe(ERROR_CODES.DEALERSHIP_CUIT_LOCKED);
    expect(thrown.message).toContain('CUIT');
    expect(prismaMock.dealership.update).not.toHaveBeenCalled();
  });

  it('409: CUIT bloqueado cuando status active + claimedAt (sin super_admin) → code DEALERSHIP_CUIT_LOCKED', async () => {
    prismaMock.dealership.findUnique.mockResolvedValue({
      ...baseDealership,
      status: 'active',
      claimedAt: new Date('2026-02-01'),
      taxId: '30111222333',
    });

    let thrown: any;
    try {
      await execute({ taxId: '30999999999' });
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(CodedHttpException);
    expect(thrown.getStatus()).toBe(409);
    expect(thrown.getCode()).toBe(ERROR_CODES.DEALERSHIP_CUIT_LOCKED);
    expect(thrown.message).toContain('CUIT');
    expect(prismaMock.dealership.update).not.toHaveBeenCalled();
    expect(eventEmitterMock.emit).not.toHaveBeenCalled();
  });

  it('CUIT bloqueado es un no-op cuando el valor enviado es idéntico (reformateado) aunque esté reclamada', async () => {
    prismaMock.dealership.findUnique.mockResolvedValue({
      ...baseDealership,
      status: 'active',
      claimedAt: new Date('2026-02-01'),
      taxId: '30123456789',
    });

    const result = await execute({ taxId: '30-12345678-9' });

    expect(result).toMatchObject({ id: 'd1' });
    expect(prismaMock.dealership.update).not.toHaveBeenCalled();
    expect(eventEmitterMock.emit).not.toHaveBeenCalled();
  });

  it('excepción super_admin: puede modificar el CUIT de una concesionaria reclamada activa', async () => {
    prismaMock.dealership.findUnique.mockImplementation((args: any) => {
      if (args.where.id)
        return Promise.resolve({
          ...baseDealership,
          status: 'active',
          claimedAt: new Date('2026-02-01'),
          taxId: '30111222333',
        });
      return Promise.resolve(null);
    });
    prismaMock.systemRoleAssignment.findMany.mockResolvedValue(
      superAdminAssignments,
    );

    await expect(
      execute({ taxId: '30-99999999-9' }, {
        id: 'sa-1',
        email: 'sa@test.com',
      }),
    ).resolves.toMatchObject({ taxId: '30999999999' });

    expect(prismaMock.dealership.update).toHaveBeenCalledWith({
      where: { id: 'd1' },
      data: { taxId: '30999999999' },
    });
    expect(eventEmitterMock.emit).toHaveBeenCalledWith(
      'admin.dealership.updated',
      expect.objectContaining({ updatedByRole: 'super_admin' }),
    );
  });

  it('CUIT sin cambio (reformateado equivalente) → no-op sin update ni evento', async () => {
    prismaMock.dealership.findUnique.mockResolvedValue({
      ...baseDealership,
      taxId: '30123456789',
    });

    await execute({ taxId: '30-12345678-9' });

    expect(prismaMock.dealership.update).not.toHaveBeenCalled();
    expect(eventEmitterMock.emit).not.toHaveBeenCalled();
  });

  it('sin cambios (DTO vacío) → retorna existente sin update ni evento', async () => {
    const result = await execute({});

    expect(result).toMatchObject({ id: 'd1', name: 'Concesionaria Norte' });
    expect(prismaMock.dealership.update).not.toHaveBeenCalled();
    expect(eventEmitterMock.emit).not.toHaveBeenCalled();
  });

  it('mass-assignment: campos desconocidos del DTO nunca llegan al update', async () => {
    await execute({
      name: 'Concesionaria Norte',
      ownerEmail: 'hack@example.com',
      isActive: false,
      status: 'active',
    });

    expect(prismaMock.dealership.update).not.toHaveBeenCalled();
    expect(eventEmitterMock.emit).not.toHaveBeenCalled();
  });

  it('red P2002 en el write (carrera de duplicados) → 409 controlado', async () => {
    prismaMock.dealership.update.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed on the fields: (`taxId`)',
        { code: 'P2002', clientVersion: 'test', meta: { target: ['taxId'] } },
      ),
    );

    let thrown: any;
    try {
      await execute({ taxId: '30999999999' });
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(CodedHttpException);
    expect(thrown.getCode()).toBe(ERROR_CODES.CONFLICT);
    expect(thrown.getCode()).not.toBe(ERROR_CODES.DEALERSHIP_CUIT_LOCKED);
    expect(thrown.message).toContain('CUIT');
    expect(eventEmitterMock.emit).not.toHaveBeenCalled();
  });
});
