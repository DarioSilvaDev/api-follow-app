import { ForbiddenException, UnauthorizedException, ConflictException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AcceptInvitationHandler } from './accept-invitation.handler';
import { AcceptInvitationCommand } from './accept-invitation.command';

describe('AcceptInvitationHandler — dealership (espejo #5 workshop + oracle)', () => {
  let handler: AcceptInvitationHandler;
  let prismaMock: {
    dealershipInvitation: { findUnique: jest.Mock; update: jest.Mock };
    dealershipMember: { findUnique: jest.Mock; create: jest.Mock };
  };
  let eventEmitterMock: { emit: jest.Mock };
  let permissionCacheMock: { invalidateUser: jest.Mock };

  const pendingInvitation = {
    id: 'inv-1',
    dealershipId: 'd1',
    roleId: 'r-seller',
    email: 'target@example.com',
    token: 'tok-1',
    status: 'pending',
    expiresAt: new Date(Date.now() + 100000),
  };

  beforeEach(() => {
    prismaMock = {
      dealershipInvitation: { findUnique: jest.fn(), update: jest.fn() },
      dealershipMember: { findUnique: jest.fn(), create: jest.fn() },
    };
    eventEmitterMock = { emit: jest.fn() };
    permissionCacheMock = { invalidateUser: jest.fn() };
    handler = new AcceptInvitationHandler(
      prismaMock as any,
      eventEmitterMock as unknown as EventEmitter2,
      permissionCacheMock as any,
    );
  });

  it('rejects with 403 when the invitation email does not match the authenticated user', async () => {
    prismaMock.dealershipInvitation.findUnique.mockResolvedValue(
      pendingInvitation,
    );

    await expect(
      handler.execute(
        new AcceptInvitationCommand('tok-1', 'user-diff', 'other@example.com'),
      ),
    ).rejects.toThrow(ForbiddenException);
    expect(prismaMock.dealershipMember.create).not.toHaveBeenCalled();
    expect(prismaMock.dealershipInvitation.update).not.toHaveBeenCalled();
  });

  it('accepts the invitation when emails match (case-insensitive)', async () => {
    prismaMock.dealershipInvitation.findUnique.mockResolvedValue(
      pendingInvitation,
    );
    prismaMock.dealershipMember.findUnique.mockResolvedValue(null);
    prismaMock.dealershipMember.create.mockResolvedValue({
      id: 'member-1',
      dealershipId: 'd1',
      userId: 'user-1',
    });
    prismaMock.dealershipInvitation.update.mockResolvedValue({});

    const member = await handler.execute(
      new AcceptInvitationCommand('tok-1', 'user-1', 'TARGET@example.com'),
    );

    expect(member).toEqual({ id: 'member-1', dealershipId: 'd1', userId: 'user-1' });
    expect(prismaMock.dealershipMember.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.dealershipInvitation.update).toHaveBeenCalledWith({
      where: { id: 'inv-1' },
      data: { status: 'accepted', acceptedAt: expect.any(Date) },
    });
    expect(eventEmitterMock.emit).toHaveBeenCalledWith(
      'dealership.member.joined',
      expect.objectContaining({ dealershipId: 'd1', userId: 'user-1' }),
    );
    expect(permissionCacheMock.invalidateUser).toHaveBeenCalledWith('user-1');
  });

  it('rejects invalid/expired/unaccepted invitations with 401', async () => {
    prismaMock.dealershipInvitation.findUnique.mockResolvedValue(null);

    await expect(
      handler.execute(new AcceptInvitationCommand('bad-token', 'user-1', 'a@b.com')),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects with 409 when the user is already an active member (double accept)', async () => {
    prismaMock.dealershipInvitation.findUnique.mockResolvedValue(
      pendingInvitation,
    );
    prismaMock.dealershipMember.findUnique.mockResolvedValue({
      dealershipId: 'd1',
      userId: 'user-1',
      status: 'active',
    });

    await expect(
      handler.execute(
        new AcceptInvitationCommand('tok-1', 'user-1', 'target@example.com'),
      ),
    ).rejects.toThrow(ConflictException);
    expect(prismaMock.dealershipMember.create).not.toHaveBeenCalled();
    expect(prismaMock.dealershipInvitation.update).not.toHaveBeenCalled();
  });
});