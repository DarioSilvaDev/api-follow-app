import { NotFoundException, ConflictException } from '@nestjs/common';
import { AddDealershipMemberHandler } from './add-dealership-member.handler';
import { AddDealershipMemberCommand } from './add-dealership-member.command';

/**
 * Alta administrada de miembro de concesionaria (panel superadmin/admin).
 * Alta directa sin invitación; reactiva membresías `inactive` previas.
 */
describe('AddDealershipMemberHandler (admin) — alta directa en concesionaria', () => {
  let handler: AddDealershipMemberHandler;
  let prismaMock: any;
  let permissionCacheMock: { invalidateUser: jest.Mock; invalidate: jest.Mock };

  const dealership = { id: 'd1', name: 'Concesionaria Norte', deletedAt: null };
  const user = { id: 'u1', email: 'user@test.com', deletedAt: null };
  const role = { id: 'r1', dealershipId: 'd1', code: 'seller', priority: 40 };

  beforeEach(() => {
    prismaMock = {
      dealership: {
        findUnique: jest.fn().mockResolvedValue({ ...dealership }),
      },
      user: { findUnique: jest.fn().mockResolvedValue({ ...user }) },
      dealershipRole: { findUnique: jest.fn().mockResolvedValue({ ...role }) },
      dealershipMember: {
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
    handler = new AddDealershipMemberHandler(
      prismaMock,
      permissionCacheMock as any,
    );
  });

  const run = () =>
    handler.execute(
      new AddDealershipMemberCommand(
        'd1',
        { email: 'User@Test.com ', roleId: 'r1' } as any,
        'admin-1',
      ),
    );

  it('crea la membresía como active y normaliza el email', async () => {
    const member = await run();

    expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
      where: { email: 'user@test.com' },
    });
    expect(prismaMock.dealershipMember.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        dealershipId: 'd1',
        userId: 'u1',
        roleId: 'r1',
        status: 'active',
      }),
    });
    expect(member).toEqual(expect.objectContaining({ reactivated: false }));
    expect(member.status).toBe('active');
    expect(permissionCacheMock.invalidateUser).toHaveBeenCalledWith('u1');
  });

  it('404 si la concesionaria no existe o está soft-deleted', async () => {
    prismaMock.dealership.findUnique.mockResolvedValue({
      ...dealership,
      deletedAt: new Date(),
    });

    await expect(run()).rejects.toThrow(NotFoundException);
    expect(prismaMock.dealershipMember.create).not.toHaveBeenCalled();
  });

  it('404 si el usuario no existe', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);

    await expect(run()).rejects.toThrow(NotFoundException);
  });

  it('409 si el usuario ya es miembro activo', async () => {
    prismaMock.dealershipMember.findUnique.mockResolvedValue({
      id: 'm1',
      status: 'active',
    });

    await expect(run()).rejects.toThrow(ConflictException);
  });

  it('reactiva una membresía inactive con el rol indicado', async () => {
    prismaMock.dealershipMember.findUnique.mockResolvedValue({
      id: 'm1',
      dealershipId: 'd1',
      userId: 'u1',
      status: 'inactive',
      joinedAt: new Date('2026-01-01'),
    });

    const member = await run();

    expect(prismaMock.dealershipMember.update).toHaveBeenCalledWith({
      where: { id: 'm1' },
      data: expect.objectContaining({
        status: 'active',
        roleId: 'r1',
        leftAt: null,
      }),
    });
    expect(prismaMock.dealershipMember.create).not.toHaveBeenCalled();
    expect(permissionCacheMock.invalidateUser).toHaveBeenCalledWith('u1');
    expect(member).toEqual(expect.objectContaining({ reactivated: true }));
    expect(member.status).toBe('active');
  });

  it('404 si el rol pertenece a otra concesionaria', async () => {
    prismaMock.dealershipRole.findUnique.mockResolvedValue({
      ...role,
      dealershipId: 'otra',
    });

    await expect(run()).rejects.toThrow(NotFoundException);
  });
});
