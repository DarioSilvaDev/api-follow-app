import { NotFoundException, ConflictException } from '@nestjs/common';
import { AddMemberHandler } from './add-member.handler';
import { AddMemberCommand } from './add-member.command';

/**
 * Alta de miembro de taller desde el panel de administración.
 * Homogeneizado con el de concesionarias (fix): email normalizado, rol
 * validado antes del chequeo de membresía, reactivación de membresías
 * `inactive` (409 para activas/pendientes/suspendidas).
 */
describe('AddMemberHandler (admin) — alta directa en taller', () => {
  let handler: AddMemberHandler;
  let prismaMock: any;
  let permissionCacheMock: { invalidateUser: jest.Mock; invalidate: jest.Mock };

  const workshop = { id: 'w1', name: 'Taller Norte', deletedAt: null };
  const user = { id: 'u1', email: 'user@test.com', deletedAt: null };
  const role = { id: 'r1', workshopId: 'w1', code: 'mechanic', priority: 50 };

  beforeEach(() => {
    prismaMock = {
      workshop: { findUnique: jest.fn().mockResolvedValue({ ...workshop }) },
      user: { findUnique: jest.fn().mockResolvedValue({ ...user }) },
      workshopRole: { findUnique: jest.fn().mockResolvedValue({ ...role }) },
      workshopMember: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest
          .fn()
          .mockImplementation(({ data }) =>
            Promise.resolve({ id: 'm1', ...data }),
          ),
        update: jest
          .fn()
          .mockImplementation(({ data }) =>
            Promise.resolve({ id: 'm1', userId: 'u1', ...data }),
          ),
      },
    };
    permissionCacheMock = {
      invalidateUser: jest.fn(),
      invalidate: jest.fn(),
    };
    handler = new AddMemberHandler(prismaMock, permissionCacheMock as any);
  });

  const run = () =>
    handler.execute(
      new AddMemberCommand(
        'w1',
        { email: 'User@Test.com ', roleId: 'r1' } as any,
        'admin-1',
      ),
    );

  it('crea la membresía como active, normaliza el email y devuelve reactivated: false', async () => {
    const member = await run();

    expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
      where: { email: 'user@test.com' },
    });
    expect(prismaMock.workshopMember.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workshopId: 'w1',
        userId: 'u1',
        roleId: 'r1',
        status: 'active',
      }),
    });
    expect(member).toEqual(expect.objectContaining({ reactivated: false }));
    expect(permissionCacheMock.invalidateUser).toHaveBeenCalledWith('u1');
  });

  it('404 si el taller no existe o está soft-deleted', async () => {
    prismaMock.workshop.findUnique.mockResolvedValue({
      ...workshop,
      deletedAt: new Date(),
    });

    await expect(run()).rejects.toThrow(NotFoundException);
    expect(prismaMock.workshopMember.create).not.toHaveBeenCalled();
  });

  it('404 si el usuario no existe', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);

    await expect(run()).rejects.toThrow(NotFoundException);
  });

  it('404 si el rol pertenece a otro taller', async () => {
    prismaMock.workshopRole.findUnique.mockResolvedValue({
      ...role,
      workshopId: 'otro',
    });

    await expect(run()).rejects.toThrow(NotFoundException);
  });

  it.each(['active', 'pending', 'suspended'])(
    '409 si la membresía existe con status %s',
    async (status) => {
      prismaMock.workshopMember.findUnique.mockResolvedValue({
        id: 'm1',
        status,
      });

      await expect(run()).rejects.toThrow(ConflictException);
      expect(prismaMock.workshopMember.update).not.toHaveBeenCalled();
    },
  );

  it('reactiva una membresía inactive con el rol indicado y devuelve reactivated: true', async () => {
    prismaMock.workshopMember.findUnique.mockResolvedValue({
      id: 'm1',
      workshopId: 'w1',
      userId: 'u1',
      status: 'inactive',
      joinedAt: new Date('2026-01-01'),
      leftAt: new Date('2026-06-01'),
      defaultBranchId: 'b1',
    });

    const member = await run();

    expect(prismaMock.workshopMember.update).toHaveBeenCalledWith({
      where: { id: 'm1' },
      data: {
        status: 'active',
        roleId: 'r1',
        leftAt: null,
        defaultBranchId: null,
      },
    });
    expect(prismaMock.workshopMember.create).not.toHaveBeenCalled();
    expect(member).toEqual(expect.objectContaining({ reactivated: true }));
    expect(permissionCacheMock.invalidateUser).toHaveBeenCalledWith('u1');
  });
});
