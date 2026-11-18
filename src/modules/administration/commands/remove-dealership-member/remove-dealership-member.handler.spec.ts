import { NotFoundException } from '@nestjs/common';
import { RemoveDealershipMemberHandler } from './remove-dealership-member.handler';
import { RemoveDealershipMemberCommand } from './remove-dealership-member.command';

/**
 * Remoción soft de miembro de concesionaria desde el panel de administración:
 * `status = inactive` + `leftAt` (espejo de workshops admin).
 */
describe('RemoveDealershipMemberHandler (admin)', () => {
  let handler: RemoveDealershipMemberHandler;
  let prismaMock: any;
  let permissionCacheMock: { invalidateUser: jest.Mock };

  const member = {
    id: 'm1',
    dealershipId: 'd1',
    userId: 'u1',
    status: 'active',
  };

  beforeEach(() => {
    prismaMock = {
      dealershipMember: {
        findUnique: jest.fn().mockResolvedValue({ ...member }),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    permissionCacheMock = { invalidateUser: jest.fn() };
    handler = new RemoveDealershipMemberHandler(
      prismaMock,
      permissionCacheMock as any,
    );
  });

  it('marca la membresía como inactive con leftAt e invalida el cache', async () => {
    await handler.execute(new RemoveDealershipMemberCommand('m1'));

    expect(prismaMock.dealershipMember.update).toHaveBeenCalledWith({
      where: { id: 'm1' },
      data: { status: 'inactive', leftAt: expect.any(Date) },
    });
    expect(permissionCacheMock.invalidateUser).toHaveBeenCalledWith('u1');
  });

  it('404 si la membresía no existe o ya está inactive', async () => {
    prismaMock.dealershipMember.findUnique.mockResolvedValue({
      ...member,
      status: 'inactive',
    });

    await expect(
      handler.execute(new RemoveDealershipMemberCommand('m1')),
    ).rejects.toThrow(NotFoundException);
    expect(prismaMock.dealershipMember.update).not.toHaveBeenCalled();
  });
});
