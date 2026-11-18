import { NotFoundException, BadRequestException } from '@nestjs/common';
import { UpdateDealershipMemberRoleHandler } from './update-dealership-member-role.handler';
import { UpdateDealershipMemberRoleCommand } from './update-dealership-member-role.command';

/**
 * Cambio de rol de miembro de concesionaria desde el panel de administración.
 * Sin chequeo de jerarquía RB-10 (override de plataforma — espejo de
 * workshops admin).
 */
describe('UpdateDealershipMemberRoleHandler (admin)', () => {
  let handler: UpdateDealershipMemberRoleHandler;
  let prismaMock: any;
  let permissionCacheMock: { invalidateUser: jest.Mock };

  const member = {
    id: 'm1',
    dealershipId: 'd1',
    userId: 'u1',
    status: 'active',
  };
  const role = { id: 'r2', dealershipId: 'd1', code: 'admin', priority: 60 };

  beforeEach(() => {
    prismaMock = {
      dealershipMember: {
        findUnique: jest.fn().mockResolvedValue({ ...member }),
        update: jest
          .fn()
          .mockImplementation(({ data }) =>
            Promise.resolve({ ...member, ...data }),
          ),
      },
      dealershipRole: {
        findUnique: jest.fn().mockResolvedValue({ ...role }),
      },
    };
    permissionCacheMock = { invalidateUser: jest.fn() };
    handler = new UpdateDealershipMemberRoleHandler(
      prismaMock,
      permissionCacheMock as any,
    );
  });

  it('actualiza el rol e invalida el cache de permisos del usuario', async () => {
    const updated = await handler.execute(
      new UpdateDealershipMemberRoleCommand('m1', 'r2'),
    );

    expect(prismaMock.dealershipMember.update).toHaveBeenCalledWith({
      where: { id: 'm1' },
      data: { roleId: 'r2' },
    });
    expect(permissionCacheMock.invalidateUser).toHaveBeenCalledWith('u1');
    expect(updated.roleId).toBe('r2');
  });

  it('404 si la membresía no existe o está inactive', async () => {
    prismaMock.dealershipMember.findUnique.mockResolvedValue({
      ...member,
      status: 'inactive',
    });

    await expect(
      handler.execute(new UpdateDealershipMemberRoleCommand('m1', 'r2')),
    ).rejects.toThrow(NotFoundException);
  });

  it('400 si el rol pertenece a otra concesionaria', async () => {
    prismaMock.dealershipRole.findUnique.mockResolvedValue({
      ...role,
      dealershipId: 'otra',
    });

    await expect(
      handler.execute(new UpdateDealershipMemberRoleCommand('m1', 'r2')),
    ).rejects.toThrow(BadRequestException);
  });
});
