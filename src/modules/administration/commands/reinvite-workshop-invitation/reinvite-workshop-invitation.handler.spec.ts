import { EventEmitter2 } from '@nestjs/event-emitter';
import { NotFoundException } from '@nestjs/common';
import {
  CodedHttpException,
  InvitationUsedException,
} from '../../../../common/exceptions/coded.exception';
import { ReinviteWorkshopInvitationHandler } from './reinvite-workshop-invitation.handler';
import { ReinviteWorkshopInvitationCommand } from './reinvite-workshop-invitation.command';

// uuid@14 es ESM-only; se mockea para que ts-jest cargue el handler y el
// token sea determinístico (mismo patrón que register.handler.spec.ts).
jest.mock('uuid', () => ({
  v4: jest.fn().mockReturnValue('token-fresco'),
}));

describe('ReinviteWorkshopInvitationHandler — D-106 reenvío admin', () => {
  let handler: ReinviteWorkshopInvitationHandler;
  let prismaMock: {
    workshop: { findUnique: jest.Mock };
    workshopInvitation: {
      findFirst: jest.Mock;
      updateMany: jest.Mock;
      create: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let eventEmitterMock: { emit: jest.Mock };

  const workshop = {
    id: 'w1',
    name: 'Taller Norte',
    email: 'dueno@example.com',
    status: 'pending_claim',
  };

  const makeTxMock = () => ({
    workshopInvitation: {
      updateMany: jest.fn(),
      create: jest.fn(),
    },
    workshopRole: { findUnique: jest.fn() },
  });

  beforeEach(() => {
    prismaMock = {
      workshop: { findUnique: jest.fn() },
      workshopInvitation: {
        findFirst: jest.fn(),
        updateMany: jest.fn(),
        create: jest.fn(),
      },
      $transaction: jest.fn(),
    };
    eventEmitterMock = { emit: jest.fn() };
    handler = new ReinviteWorkshopInvitationHandler(
      prismaMock as any,
      eventEmitterMock as unknown as EventEmitter2,
    );
  });

  it('rechaza con 404 si el taller no existe', async () => {
    prismaMock.workshop.findUnique.mockResolvedValue(null);

    await expect(
      handler.execute(
        new ReinviteWorkshopInvitationCommand('w-x', 'admin-1'),
      ),
    ).rejects.toThrow(NotFoundException);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('rechaza con 409 INVITATION_USED si el taller ya fue reclamado', async () => {
    prismaMock.workshop.findUnique.mockResolvedValue({
      ...workshop,
      status: 'active',
    });

    await expect(
      handler.execute(new ReinviteWorkshopInvitationCommand('w1', 'admin-1')),
    ).rejects.toThrow(InvitationUsedException);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('NO reenvía si la invitación pending sigue vigente (409 CONFLICT)', async () => {
    prismaMock.workshop.findUnique.mockResolvedValue(workshop);
    prismaMock.workshopInvitation.findFirst.mockResolvedValue({
      id: 'inv-1',
      expiresAt: new Date(Date.now() + 100000),
    });

    await expect(
      handler.execute(new ReinviteWorkshopInvitationCommand('w1', 'admin-1')),
    ).rejects.toMatchObject({ status: 409 });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(eventEmitterMock.emit).not.toHaveBeenCalled();
  });

  it('cancela pendientes vencidas y crea el nuevo token (200 + mail)', async () => {
    prismaMock.workshop.findUnique.mockResolvedValue(workshop);
    prismaMock.workshopInvitation.findFirst.mockResolvedValue({
      id: 'inv-vieja',
      expiresAt: new Date(Date.now() - 1000),
    });

    const tx = makeTxMock();
    tx.workshopInvitation.create.mockResolvedValue({
      id: 'inv-nueva',
      email: 'dueno@example.com',
      expiresAt: new Date(),
      status: 'pending',
    });
    tx.workshopRole.findUnique.mockResolvedValue({
      id: 'role-owner',
      code: 'owner',
    });
    prismaMock.$transaction.mockImplementation(
      async (cb: (t: typeof tx) => unknown) => cb(tx),
    );

    const result = await handler.execute(
      new ReinviteWorkshopInvitationCommand('w1', 'admin-1'),
    );

    expect(tx.workshopInvitation.updateMany).toHaveBeenCalledWith({
      where: {
        workshopId: 'w1',
        email: 'dueno@example.com',
        status: 'pending',
        expiresAt: { lte: expect.any(Date) },
      },
      data: { status: 'cancelled' },
    });
    expect(tx.workshopInvitation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workshopId: 'w1',
        roleId: 'role-owner',
        invitedById: 'admin-1',
        email: 'dueno@example.com',
        token: 'token-fresco',
        status: 'pending',
        expiresAt: expect.any(Date),
      }),
    });
    // Respuesta del contrato: solo invitation (el token NUNCA se expone).
    expect(result).toEqual({
      invitation: {
        id: 'inv-nueva',
        email: 'dueno@example.com',
        expiresAt: expect.any(Date),
        status: 'pending',
      },
    });
    expect(JSON.stringify(result)).not.toContain('token-fresco');
    expect(eventEmitterMock.emit).toHaveBeenCalledWith(
      'workshop.member.invited',
      expect.objectContaining({ workshopId: 'w1' }),
    );
  });
});