import { ForbiddenException } from '@nestjs/common';
import { MemberStatus } from '@prisma/client';
import { ListWorkshopsHandler } from './list-workshops.handler';

describe('ListWorkshopsHandler — workshop visibility (Security Review #9)', () => {
  let handler: ListWorkshopsHandler;
  let prismaMock: {
    systemRole: { findUnique: jest.Mock };
    systemRoleAssignment: { findFirst: jest.Mock };
    workshopMember: { findFirst: jest.Mock };
    workshop: { findMany: jest.Mock; count: jest.Mock };
  };

  beforeEach(() => {
    prismaMock = {
      systemRole: { findUnique: jest.fn() },
      systemRoleAssignment: { findFirst: jest.fn() },
      workshopMember: { findFirst: jest.fn() },
      workshop: { findMany: jest.fn(), count: jest.fn() },
    };
    handler = new ListWorkshopsHandler(prismaMock as any);
  });

  it('rejects 403 PERMISSION_DENIED when a non-member (non-super) lists workshops', async () => {
    prismaMock.systemRole.findUnique.mockResolvedValue({ id: 'super-role' });
    prismaMock.systemRoleAssignment.findFirst.mockResolvedValue(null);
    prismaMock.workshopMember.findFirst.mockResolvedValue(null);

    await expect(handler.execute({ userId: 'u1' })).rejects.toThrow(
      ForbiddenException,
    );
    expect(prismaMock.workshop.findMany).not.toHaveBeenCalled();
  });

  it('allows listing all workshops when no caller is provided (admin module path)', async () => {
    prismaMock.workshop.findMany.mockResolvedValue([{ id: 'w1' }]);
    prismaMock.workshop.count.mockResolvedValue(1);

    const result = await handler.execute({ page: 1, limit: 20 });

    expect(result.data).toEqual([{ id: 'w1' }]);
    const findManyArg = prismaMock.workshop.findMany.mock.calls[0][0];
    expect(findManyArg.where).toBeUndefined();
  });

  it('allows an active member to list only its own workshops (membership filter)', async () => {
    prismaMock.systemRole.findUnique.mockResolvedValue({ id: 'super-role' });
    prismaMock.systemRoleAssignment.findFirst.mockResolvedValue(null);
    prismaMock.workshopMember.findFirst.mockResolvedValue({ id: 'member-1' });
    prismaMock.workshop.findMany.mockResolvedValue([{ id: 'w1' }]);
    prismaMock.workshop.count.mockResolvedValue(1);

    const result = await handler.execute({ userId: 'u1', page: 1, limit: 20 });

    expect(result.data).toEqual([{ id: 'w1' }]);
    expect(prismaMock.workshop.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          members: {
            some: { userId: 'u1', status: MemberStatus.active },
          },
        },
      }),
    );
  });

  it('allows a super admin to list all workshops (no membership filter)', async () => {
    prismaMock.systemRole.findUnique.mockResolvedValue({ id: 'super-role' });
    prismaMock.systemRoleAssignment.findFirst.mockResolvedValue({
      id: 'assign-1',
    });
    prismaMock.workshop.findMany.mockResolvedValue([
      { id: 'w1', membershipIsIrrelevant: true },
      { id: 'w2' },
    ]);
    prismaMock.workshop.count.mockResolvedValue(2);

    const result = await handler.execute({ userId: 'sa-1', page: 1, limit: 20 });

    expect(result.data).toHaveLength(2);
    // Super admin does not hit membership nor requires active-membership filter
    expect(prismaMock.workshopMember.findFirst).not.toHaveBeenCalled();
    const findManyArg = prismaMock.workshop.findMany.mock.calls[0][0];
    expect(findManyArg.where).toBeUndefined();
  });
});