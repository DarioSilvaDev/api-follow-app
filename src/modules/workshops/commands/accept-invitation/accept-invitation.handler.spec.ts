import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AcceptInvitationHandler } from './accept-invitation.handler';
import { AcceptInvitationCommand } from './accept-invitation.command';

describe('AcceptInvitationHandler — email binding (Security Review #5)', () => {
  let handler: AcceptInvitationHandler;
  let prismaMock: {
    workshopInvitation: {
      findUnique: jest.Mock;
      update: jest.Mock;
    };
    workshopMember: { create: jest.Mock };
  };
  let eventEmitterMock: { emit: jest.Mock };
  let permissionCacheMock: { invalidateUser: jest.Mock };

  const pendingInvitation = {
    id: 'inv-1',
    workshopId: 'w1',
    roleId: 'r1',
    email: 'target@example.com',
    token: 'tok-1',
    status: 'pending',
    expiresAt: new Date(Date.now() + 100000),
  };

  beforeEach(() => {
    prismaMock = {
      workshopInvitation: { findUnique: jest.fn(), update: jest.fn() },
      workshopMember: { create: jest.fn() },
    };
    eventEmitterMock = { emit: jest.fn() };
    permissionCacheMock = { invalidateUser: jest.fn() };
    handler = new AcceptInvitationHandler(
      prismaMock as any,
      eventEmitterMock as unknown as EventEmitter2,
      permissionCacheMock as any,
    );
  });

  it('rejects with 403 PERMISSION_DENIED when invitation email does not match the authenticated user', async () => {
    prismaMock.workshopInvitation.findUnique.mockResolvedValue(pendingInvitation);

    const cmd = new AcceptInvitationCommand(
      'tok-1',
      'user-different',
      'other@example.com',
    );

    await expect(handler.execute(cmd)).rejects.toThrow(ForbiddenException);
    expect(prismaMock.workshopMember.create).not.toHaveBeenCalled();
    expect(prismaMock.workshopInvitation.update).not.toHaveBeenCalled();
  });

  it('accepts the invitation when the emails match (case-insensitive)', async () => {
    prismaMock.workshopInvitation.findUnique.mockResolvedValue(pendingInvitation);
    prismaMock.workshopMember.create.mockResolvedValue({ id: 'member-1' });
    prismaMock.workshopInvitation.update.mockResolvedValue({});

    const cmd = new AcceptInvitationCommand(
      'tok-1',
      'user-1',
      'TARGET@example.com',
    );

    const member = await handler.execute(cmd);

    expect(member).toEqual({ id: 'member-1' });
    expect(prismaMock.workshopMember.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.workshopInvitation.update).toHaveBeenCalledWith(
      { where: { id: 'inv-1' }, data: { status: 'accepted', acceptedAt: expect.any(Date) } },
    );
    expect(eventEmitterMock.emit).toHaveBeenCalled();
    expect(permissionCacheMock.invalidateUser).toHaveBeenCalledWith('user-1');
  });

  it('keeps rejecting invalid/expired/unaccepted invitations', async () => {
    prismaMock.workshopInvitation.findUnique.mockResolvedValue(null);
    const cmd = new AcceptInvitationCommand('bad-token', 'user-1', 'a@b.com');
    await expect(handler.execute(cmd)).rejects.toThrow(UnauthorizedException);
  });
});