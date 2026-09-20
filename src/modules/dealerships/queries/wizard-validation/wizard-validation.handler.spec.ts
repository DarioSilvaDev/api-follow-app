import { EventEmitter2 } from '@nestjs/event-emitter';
import { InvitationInvalidException } from '../../../../common/exceptions/coded.exception';
import { WizardValidationHandler } from './wizard-validation.handler';

describe('WizardValidationHandler — D-106 validación pública del token', () => {
  let handler: WizardValidationHandler;
  let prismaMock: {
    dealershipInvitation: { findUnique: jest.Mock };
    user: { findFirst: jest.Mock };
  };

  const baseInvitation = {
    id: 'inv-1',
    dealershipId: 'd1',
    email: 'dueno@example.com',
    token: 'tok-1',
    status: 'pending',
    expiresAt: new Date(Date.now() + 100000),
    dealership: {
      id: 'd1',
      name: 'Concesionaria Norte',
      status: 'pending_claim',
    },
  };

  beforeEach(() => {
    prismaMock = {
      dealershipInvitation: { findUnique: jest.fn() },
      user: { findFirst: jest.fn() },
    };
    handler = new WizardValidationHandler(prismaMock as any);
  });

  it('devuelve requiresRegister=true si no existe cuenta del dueño (email insensitive, excluye deletedAt)', async () => {
    prismaMock.dealershipInvitation.findUnique.mockResolvedValue(
      baseInvitation,
    );
    prismaMock.user.findFirst.mockResolvedValue(null);

    const result = await handler.execute('tok-1');

    expect(result).toEqual({
      valid: true,
      status: 'pending',
      expiresAt: baseInvitation.expiresAt,
      dealership: { id: 'd1', name: 'Concesionaria Norte' },
      email: 'dueno@example.com',
      account: { exists: false, status: null },
      requiresRegister: true,
    });
    expect(prismaMock.user.findFirst).toHaveBeenCalledWith({
      where: {
        email: { equals: 'dueno@example.com', mode: 'insensitive' },
        deletedAt: null,
      },
      select: { id: true, status: true },
    });
  });

  it('devuelve requiresRegister=false si el dueño ya tiene cuenta activa', async () => {
    prismaMock.dealershipInvitation.findUnique.mockResolvedValue(
      baseInvitation,
    );
    prismaMock.user.findFirst.mockResolvedValue({ id: 'u1', status: 'active' });

    const result = await handler.execute('tok-1');

    expect(result.requiresRegister).toBe(false);
    expect(result.account).toEqual({ exists: true, status: 'active' });
  });

  it('devuelve requiresRegister=true si la cuenta del dueño está pending (login de auth la rechaza)', async () => {
    prismaMock.dealershipInvitation.findUnique.mockResolvedValue(
      baseInvitation,
    );
    prismaMock.user.findFirst.mockResolvedValue({
      id: 'u1',
      status: 'pending',
    });

    const result = await handler.execute('tok-1');

    expect(result.requiresRegister).toBe(true);
    expect(result.account).toEqual({ exists: true, status: 'pending' });
  });

  it('trata el usuario deletedAt como inexistente', async () => {
    prismaMock.dealershipInvitation.findUnique.mockResolvedValue(
      baseInvitation,
    );
    prismaMock.user.findFirst.mockResolvedValue(null);

    const result = await handler.execute('tok-1');

    expect(result.requiresRegister).toBe(true);
  });

  it('rechaza token inexistente con 404 INVITATION_INVALID', async () => {
    prismaMock.dealershipInvitation.findUnique.mockResolvedValue(null);

    await expect(handler.execute('bad-token')).rejects.toThrow(
      InvitationInvalidException,
    );
  });

  it('rechaza invitación expirada con 400 INVITATION_EXPIRED', async () => {
    prismaMock.dealershipInvitation.findUnique.mockResolvedValue({
      ...baseInvitation,
      expiresAt: new Date(Date.now() - 1000),
    });

    await expect(handler.execute('tok-1')).rejects.toMatchObject({
      status: 400,
      message: expect.stringContaining('expired'),
    });
    expect(prismaMock.user.findFirst).not.toHaveBeenCalled();
  });

  it('rechaza invitación usada con 409 INVITATION_USED', async () => {
    prismaMock.dealershipInvitation.findUnique.mockResolvedValue({
      ...baseInvitation,
      status: 'accepted',
    });

    await expect(handler.execute('tok-1')).rejects.toMatchObject({
      status: 409,
    });
  });

  it('rechaza invitación cancelada con 409 INVITATION_CANCELLED', async () => {
    prismaMock.dealershipInvitation.findUnique.mockResolvedValue({
      ...baseInvitation,
      status: 'cancelled',
    });

    await expect(handler.execute('tok-1')).rejects.toMatchObject({
      status: 409,
    });
  });

  it('rechaza invitación de dealership ya activa como usada (409)', async () => {
    prismaMock.dealershipInvitation.findUnique.mockResolvedValue({
      ...baseInvitation,
      dealership: { id: 'd1', name: 'X', status: 'active' },
    });

    await expect(handler.execute('tok-1')).rejects.toMatchObject({
      status: 409,
    });
  });
});
