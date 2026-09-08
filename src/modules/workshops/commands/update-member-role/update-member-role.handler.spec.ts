import {
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { UpdateMemberRoleHandler } from './update-member-role.handler';
import { UpdateMemberRoleCommand } from './update-member-role.command';

describe('UpdateMemberRoleHandler — workshop role hierarchy (item 8)', () => {
  let handler: UpdateMemberRoleHandler;
  let prisma: any;
  let permissionCache: any;

  const ownerRole = {
    id: 'r-owner',
    workshopId: 'w1',
    code: 'owner',
    priority: 100,
  };
  const mechanicRole = {
    id: 'r-mech',
    workshopId: 'w1',
    code: 'mechanic',
    priority: 50,
  };
  const employeeRole = {
    id: 'r-emp',
    workshopId: 'w1',
    code: 'employee',
    priority: 30,
  };

  beforeEach(() => {
    prisma = {
      workshopMember: { findUnique: jest.fn(), update: jest.fn() },
      workshopRole: { findUnique: jest.fn() },
    };
    permissionCache = { invalidateUser: jest.fn() };
    handler = new UpdateMemberRoleHandler(prisma, permissionCache);
  });

  /**
   * `findUnique` is used for the target member (by id) and the actor member
   * (by workshopId_userId, including the role).
   */
  function mockQueries(opts: {
    targetMember?: any;
    actorMember?: any;
    targetRole?: any;
  }) {
    prisma.workshopMember.findUnique.mockImplementation(({ where }: any) => {
      if (where.id !== undefined) {
        return Promise.resolve(opts.targetMember ?? null);
      }
      if (where.workshopId_userId !== undefined) {
        return Promise.resolve(opts.actorMember ?? null);
      }
      return Promise.resolve(null);
    });
    prisma.workshopRole.findUnique.mockResolvedValue(
      opts.targetRole ?? null,
    );
    prisma.workshopMember.update.mockImplementation(({ data, where }: any) =>
      Promise.resolve({ id: where.id, ...opts.targetMember, roleId: data.roleId }),
    );
  }

  function member(userId: string, workshopId = 'w1') {
    return { id: 'member-x', userId, workshopId, status: 'active' };
  }

  describe('hierarchy enforcement', () => {
    it('allows an owner to assign ANY role (including owner)', async () => {
      mockQueries({
        targetMember: member('user-a'),
        actorMember: { ...member('user-owner'), role: ownerRole },
        targetRole: ownerRole,
      });
      await expect(
        handler.execute(new UpdateMemberRoleCommand('member-x', ownerRole.id, 'user-owner')),
      ).resolves.toBeDefined();
    });

    it('forbids a mechanic from assigning a role of higher priority than their own', async () => {
      mockQueries({
        targetMember: member('user-a'),
        actorMember: { ...member('user-mech'), role: mechanicRole },
        targetRole: ownerRole,
      });
      await expect(
        handler.execute(new UpdateMemberRoleCommand('member-x', ownerRole.id, 'user-mech')),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows a mechanic to assign a role of strictly lower priority', async () => {
      mockQueries({
        targetMember: member('user-a'),
        actorMember: { ...member('user-mech'), role: mechanicRole },
        targetRole: employeeRole,
      });
      await expect(
        handler.execute(new UpdateMemberRoleCommand('member-x', employeeRole.id, 'user-mech')),
      ).resolves.toBeDefined();
    });

    it('forbids a mechanic from promoting themselves to a higher role', async () => {
      mockQueries({
        targetMember: member('user-mech'),
        actorMember: { ...member('user-mech'), role: mechanicRole },
        targetRole: ownerRole,
      });
      await expect(
        handler.execute(new UpdateMemberRoleCommand('member-x', ownerRole.id, 'user-mech')),
      ).rejects.toThrow(ForbiddenException);
    });

    it('forbids a mechanic from assigning themselves an equal (same rank) role', async () => {
      mockQueries({
        targetMember: member('user-mech'),
        actorMember: { ...member('user-mech'), role: mechanicRole },
        targetRole: mechanicRole,
      });
      await expect(
        handler.execute(new UpdateMemberRoleCommand('member-x', mechanicRole.id, 'user-mech')),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows self-demotion to a strictly lower priority role', async () => {
      mockQueries({
        targetMember: member('user-mech'),
        actorMember: { ...member('user-mech'), role: mechanicRole },
        targetRole: employeeRole,
      });
      await expect(
        handler.execute(new UpdateMemberRoleCommand('member-x', employeeRole.id, 'user-mech')),
      ).resolves.toBeDefined();
    });

    it('invalidates the affected user permission cache after a successful update', async () => {
      mockQueries({
        targetMember: member('user-a'),
        actorMember: { ...member('user-mech'), role: mechanicRole },
        targetRole: employeeRole,
      });
      await handler.execute(
        new UpdateMemberRoleCommand('member-x', employeeRole.id, 'user-mech'),
      );
      expect(permissionCache.invalidateUser).toHaveBeenCalledWith('user-a');
    });
  });

  describe('error cases', () => {
    it('throws NotFound when the target member does not exist', async () => {
      mockQueries({ targetMember: null, actorMember: null, targetRole: null });
      await expect(
        handler.execute(new UpdateMemberRoleCommand('nope', mechanicRole.id, 'user-a')),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFound when the target role does not exist', async () => {
      mockQueries({
        targetMember: member('user-a'),
        actorMember: { ...member('user-owner'), role: ownerRole },
        targetRole: null,
      });
      await expect(
        handler.execute(new UpdateMemberRoleCommand('member-x', 'nope', 'user-owner')),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFound when the target role belongs to a different workshop', async () => {
      mockQueries({
        targetMember: member('user-a'),
        actorMember: { ...member('user-owner'), role: ownerRole },
        targetRole: { ...ownerRole, workshopId: 'w-other' },
      });
      await expect(
        handler.execute(new UpdateMemberRoleCommand('member-x', ownerRole.id, 'user-owner')),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws Forbidden when the actor is not an active member of the workshop', async () => {
      mockQueries({
        targetMember: member('user-a'),
        actorMember: { ...member('user-x'), status: 'inactive', role: mechanicRole },
        targetRole: employeeRole,
      });
      await expect(
        handler.execute(new UpdateMemberRoleCommand('member-x', employeeRole.id, 'user-x')),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
