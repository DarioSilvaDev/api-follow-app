import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { GetDealershipHandler } from './get-dealership.handler';

describe('GetDealershipHandler — dealership detail visibility (espejo #9 workshop)', () => {
  let handler: GetDealershipHandler;
  let prismaMock: {
    systemRole: { findUnique: jest.Mock };
    systemRoleAssignment: { findFirst: jest.Mock };
    dealershipMember: { findUnique: jest.Mock };
    dealership: { findUnique: jest.Mock };
  };

  beforeEach(() => {
    prismaMock = {
      systemRole: { findUnique: jest.fn() },
      systemRoleAssignment: { findFirst: jest.fn() },
      dealershipMember: { findUnique: jest.fn() },
      dealership: { findUnique: jest.fn() },
    };
    handler = new GetDealershipHandler(prismaMock as any);
  });

  it('rejects 403 when a non-member (non-super) reads a foreign dealership', async () => {
    prismaMock.systemRole.findUnique.mockResolvedValue({ id: 'super-role' });
    prismaMock.systemRoleAssignment.findFirst.mockResolvedValue(null);
    prismaMock.dealershipMember.findUnique.mockResolvedValue(null);

    await expect(handler.execute('d1', 'u-foreign')).rejects.toThrow(
      ForbiddenException,
    );
    expect(prismaMock.dealership.findUnique).not.toHaveBeenCalled();
  });

  it('allows reading the detail when no user id is provided (admin module path)', async () => {
    prismaMock.dealership.findUnique.mockResolvedValue({ id: 'd1' });

    const result = await handler.execute('d1');

    expect(result).toEqual({ id: 'd1' });
    expect(prismaMock.dealershipMember.findUnique).not.toHaveBeenCalled();
  });

  it('allows an active member to read the dealership detail', async () => {
    prismaMock.systemRole.findUnique.mockResolvedValue({ id: 'super-role' });
    prismaMock.systemRoleAssignment.findFirst.mockResolvedValue(null);
    prismaMock.dealershipMember.findUnique.mockResolvedValue({
      status: 'active',
    });
    prismaMock.dealership.findUnique.mockResolvedValue({ id: 'd1' });

    const result = await handler.execute('d1', 'member-1');

    expect(result).toEqual({ id: 'd1' });
  });

  it('D-B: permite leer el detalle de una concesionaria deshabilitada (isActive=false) — badge visible en el panel', async () => {
    prismaMock.systemRole.findUnique.mockResolvedValue({ id: 'super-role' });
    prismaMock.systemRoleAssignment.findFirst.mockResolvedValue(null);
    prismaMock.dealershipMember.findUnique.mockResolvedValue({
      status: 'active',
    });
    prismaMock.dealership.findUnique.mockResolvedValue({
      id: 'd1',
      isActive: false,
      status: 'active',
    });

    const result = await handler.execute('d1', 'member-1');

    expect(result).toMatchObject({ id: 'd1', isActive: false });
  });

  it('allows a super admin to read the detail even without membership', async () => {
    prismaMock.systemRole.findUnique.mockResolvedValue({ id: 'super-role' });
    prismaMock.systemRoleAssignment.findFirst.mockResolvedValue({
      id: 'assign-1',
    });
    prismaMock.dealership.findUnique.mockResolvedValue({ id: 'd1' });

    const result = await handler.execute('d1', 'sa-1');

    expect(result).toEqual({ id: 'd1' });
    expect(prismaMock.dealershipMember.findUnique).not.toHaveBeenCalled();
  });

  it('throws NotFound when the dealership does not exist', async () => {
    prismaMock.systemRole.findUnique.mockResolvedValue({ id: 'super-role' });
    prismaMock.systemRoleAssignment.findFirst.mockResolvedValue({
      id: 'assign-1',
    });
    prismaMock.dealership.findUnique.mockResolvedValue(null);

    await expect(handler.execute('nope', 'sa-1')).rejects.toThrow(
      NotFoundException,
    );
  });
});