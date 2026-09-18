import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { UpdateMemberRoleHandler } from './update-member-role.handler';
import { UpdateMemberRoleCommand } from './update-member-role.command';

describe('UpdateMemberRoleHandler — dealership role hierarchy (RB-10)', () => {
  let handler: UpdateMemberRoleHandler;
  let prisma: any;
  let permissionCache: any;

  const ownerRole = { id: 'r-owner', dealershipId: 'd1', code: 'owner', priority: 100 };
  const adminRole = { id: 'r-admin', dealershipId: 'd1', code: 'admin', priority: 60 };
  const sellerRole = { id: 'r-seller', dealershipId: 'd1', code: 'seller', priority: 40 };

  beforeEach(() => {
    prisma = {
      dealershipMember: { findUnique: jest.fn(), update: jest.fn() },
      dealershipRole: { findUnique: jest.fn() },
    };
    permissionCache = { invalidateUser: jest.fn() };
    handler = new UpdateMemberRoleHandler(prisma, permissionCache);
  });

  function mockQueries(opts: {
    targetMember?: any;
    actorMember?: any;
    targetRole?: any;
  }) {
    prisma.dealershipMember.findUnique.mockImplementation(({ where }: any) => {
      if (where.id !== undefined) {
        return Promise.resolve(opts.targetMember ?? null);
      }
      if (where.dealershipId_userId !== undefined) {
        return Promise.resolve(opts.actorMember ?? null);
      }
      return Promise.resolve(null);
    });
    prisma.dealershipRole.findUnique.mockResolvedValue(opts.targetRole ?? null);
    prisma.dealershipMember.update.mockImplementation(({ data, where }: any) =>
      Promise.resolve({ id: where.id, ...opts.targetMember, roleId: data.roleId }),
    );
  }

  function member(userId: string, dealershipId = 'd1') {
    return { id: 'member-x', userId, dealershipId, status: 'active' };
  }

  describe('hierarchy enforcement', () => {
    it('allows an owner to assign ANY role (including owner)', async () => {
      mockQueries({
        targetMember: member('user-a'),
        actorMember: { ...member('user-owner'), role: ownerRole },
        targetRole: ownerRole,
      });
      await expect(
        handler.execute(
          new UpdateMemberRoleCommand('member-x', ownerRole.id, 'user-owner'),
        ),
      ).resolves.toBeDefined();
    });

    it('forbids a seller from assigning a role of higher priority than their own', async () => {
      mockQueries({
        targetMember: member('user-a'),
        actorMember: { ...member('user-seller'), role: sellerRole },
        targetRole: adminRole,
      });
      await expect(
        handler.execute(
          new UpdateMemberRoleCommand('member-x', adminRole.id, 'user-seller'),
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('forbids an admin from assigning owner', async () => {
      mockQueries({
        targetMember: member('user-a'),
        actorMember: { ...member('user-admin'), role: adminRole },
        targetRole: ownerRole,
      });
      await expect(
        handler.execute(
          new UpdateMemberRoleCommand('member-x', ownerRole.id, 'user-admin'),
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows a seller to assign a strictly lower role', async () => {
      mockQueries({
        targetMember: member('user-a'),
        actorMember: { ...member('user-seller'), role: sellerRole },
        targetRole: null,
      });
      // no lower role exists in the matrix; seller is the floor → reproduce
      // the same rule as the workshop spec with an employee-like custom role.
      prisma.dealershipRole.findUnique.mockResolvedValue({
        id: 'r-custom',
        dealershipId: 'd1',
        code: 'helper',
        priority: 10,
      });
      await expect(
        handler.execute(
          new UpdateMemberRoleCommand('member-x', 'r-custom', 'user-seller'),
        ),
      ).resolves.toBeDefined();
    });

    it('forbids self-promotion to an equal or higher role', async () => {
      mockQueries({
        targetMember: member('user-seller'),
        actorMember: { ...member('user-seller'), role: sellerRole },
        targetRole: sellerRole,
      });
      await expect(
        handler.execute(
          new UpdateMemberRoleCommand('member-x', sellerRole.id, 'user-seller'),
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows self-demotion to a strictly lower priority role', async () => {
      mockQueries({
        targetMember: member('user-seller'),
        actorMember: { ...member('user-seller'), role: sellerRole },
        targetRole: { ...sellerRole, id: 'r-custom', priority: 10 },
      });
      await expect(
        handler.execute(
          new UpdateMemberRoleCommand('member-x', 'r-custom', 'user-seller'),
        ),
      ).resolves.toBeDefined();
    });

    it('invalidates the affected user permission cache after a successful update', async () => {
      mockQueries({
        targetMember: member('user-a'),
        actorMember: { ...member('user-admin'), role: adminRole },
        targetRole: sellerRole,
      });
      await handler.execute(
        new UpdateMemberRoleCommand('member-x', sellerRole.id, 'user-admin'),
      );
      expect(permissionCache.invalidateUser).toHaveBeenCalledWith('user-a');
    });
  });

  describe('error cases', () => {
    it('throws NotFound when the target member does not exist', async () => {
      mockQueries({ targetMember: null, actorMember: null, targetRole: null });
      await expect(
        handler.execute(
          new UpdateMemberRoleCommand('nope', sellerRole.id, 'user-a'),
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFound when the target role does not exist', async () => {
      mockQueries({
        targetMember: member('user-a'),
        actorMember: { ...member('user-owner'), role: ownerRole },
        targetRole: null,
      });
      await expect(
        handler.execute(
          new UpdateMemberRoleCommand('member-x', 'nope', 'user-owner'),
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFound when the target role belongs to a different dealership', async () => {
      mockQueries({
        targetMember: member('user-a'),
        actorMember: { ...member('user-owner'), role: ownerRole },
        targetRole: { ...ownerRole, dealershipId: 'd-other' },
      });
      await expect(
        handler.execute(
          new UpdateMemberRoleCommand('member-x', ownerRole.id, 'user-owner'),
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws Forbidden when the actor is not an active member', async () => {
      mockQueries({
        targetMember: member('user-a'),
        actorMember: { ...member('user-x'), status: 'inactive', role: adminRole },
        targetRole: sellerRole,
      });
      await expect(
        handler.execute(
          new UpdateMemberRoleCommand('member-x', sellerRole.id, 'user-x'),
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});