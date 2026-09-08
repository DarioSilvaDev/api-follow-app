import { ForbiddenException } from '@nestjs/common';
import { MemberStatus } from '@prisma/client';
import { GetWorkshopHandler } from './get-workshop.handler';

describe('GetWorkshopHandler — workshop detail visibility (Security Review #9)', () => {
  let handler: GetWorkshopHandler;
  let prismaMock: {
    systemRole: { findUnique: jest.Mock };
    systemRoleAssignment: { findFirst: jest.Mock };
    workshopMember: { findUnique: jest.Mock };
    workshop: { findUnique: jest.Mock };
  };

  beforeEach(() => {
    prismaMock = {
      systemRole: { findUnique: jest.fn() },
      systemRoleAssignment: { findFirst: jest.fn() },
      workshopMember: { findUnique: jest.fn() },
      workshop: { findUnique: jest.fn() },
    };
    handler = new GetWorkshopHandler(prismaMock as any);
  });

  it('rejects 403 PERMISSION_DENIED when a non-member (non-super) reads a foreign workshop', async () => {
    prismaMock.systemRole.findUnique.mockResolvedValue({ id: 'super-role' });
    prismaMock.systemRoleAssignment.findFirst.mockResolvedValue(null);
    prismaMock.workshopMember.findUnique.mockResolvedValue(null);

    await expect(handler.execute('w1', 'u-foreign')).rejects.toThrow(
      ForbiddenException,
    );
    expect(prismaMock.workshop.findUnique).not.toHaveBeenCalled();
  });

  it('allows reading the detail when no user id is provided (admin module path)', async () => {
    prismaMock.workshop.findUnique.mockResolvedValue({ id: 'w1', branches: [] });

    const result = await handler.execute('w1');

    expect(result).toEqual({ id: 'w1', branches: [] });
    expect(prismaMock.workshopMember.findUnique).not.toHaveBeenCalled();
  });

  it('allows an active member to read the workshop detail', async () => {
    prismaMock.systemRole.findUnique.mockResolvedValue({ id: 'super-role' });
    prismaMock.systemRoleAssignment.findFirst.mockResolvedValue(null);
    prismaMock.workshopMember.findUnique.mockResolvedValue({
      status: MemberStatus.active,
    });
    prismaMock.workshop.findUnique.mockResolvedValue({ id: 'w1', branches: [] });

    const result = await handler.execute('w1', 'member-1');

    expect(result).toEqual({ id: 'w1', branches: [] });
  });

  it('allows a super admin to read the workshop detail even without membership', async () => {
    prismaMock.systemRole.findUnique.mockResolvedValue({ id: 'super-role' });
    prismaMock.systemRoleAssignment.findFirst.mockResolvedValue({
      id: 'assign-1',
    });
    prismaMock.workshop.findUnique.mockResolvedValue({ id: 'w1', branches: [] });

    const result = await handler.execute('w1', 'sa-1');

    expect(result).toEqual({ id: 'w1', branches: [] });
    expect(prismaMock.workshopMember.findUnique).not.toHaveBeenCalled();
  });
});