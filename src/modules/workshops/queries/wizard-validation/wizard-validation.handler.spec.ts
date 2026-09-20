import { InvitationInvalidException } from '../../../../common/exceptions/coded.exception';
import { WizardValidationHandler } from './wizard-validation.handler';

describe('WizardValidationHandler (workshops) — D-106 validación pública del token', () => {
  let handler: WizardValidationHandler;
  let prismaMock: {
    workshopInvitation: { findUnique: jest.Mock };
    user: { findFirst: jest.Mock };
  };

  const baseInvitation = {
    id: 'inv-1',
    workshopId: 'w1',
    email: 'dueno@example.com',
    token: 'tok-1',
    status: 'pending',
    expiresAt: new Date(Date.now() + 100000),
    workshop: {
      id: 'w1',
      name: 'Taller Norte',
      status: 'pending_claim',
    },
  };

  beforeEach(() => {
    prismaMock = {
      workshopInvitation: { findUnique: jest.fn() },
      user: { findFirst: jest.fn() },
    };
    handler = new WizardValidationHandler(prismaMock as any);
  });

  it('devuelve requiresRegister=true si no existe cuenta del dueño (email insensitive, excluye deletedAt)', async () => {
    prismaMock.workshopInvitation.findUnique.mockResolvedValue(baseInvitation);
    prismaMock.user.findFirst.mockResolvedValue(null);

    const result = await handler.execute('tok-1');

    expect(result).toEqual({
      valid: true,
      status: 'pending',
      expiresAt: baseInvitation.expiresAt,
      workshop: { id: 'w1', name: 'Taller Norte' },
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
    prismaMock.workshopInvitation.findUnique.mockResolvedValue(baseInvitation);
    prismaMock.user.findFirst.mockResolvedValue({ id: 'u1', status: 'active' });

    const result = await handler.execute('tok-1');

    expect(result.requiresRegister).toBe(false);
    expect(result.account).toEqual({ exists: true, status: 'active' });
  });

  it('devuelve requiresRegister=true si la cuenta del dueño está pending (login de auth la rechaza)', async () => {
    prismaMock.workshopInvitation.findUnique.mockResolvedValue(baseInvitation);
    prismaMock.user.findFirst.mockResolvedValue({
      id: 'u1',
      status: 'pending',
    });

    const result = await handler.execute('tok-1');

    expect(result.requiresRegister).toBe(true);
    expect(result.account).toEqual({ exists: true, status: 'pending' });
  });

  it('rechaza token inexistente con 404 INVITATION_INVALID', async () => {
    prismaMock.workshopInvitation.findUnique.mockResolvedValue(null);

    await expect(handler.execute('bad-token')).rejects.toThrow(
      InvitationInvalidException,
    );
  });

  it('rechaza invitación expirada con 400 INVITATION_EXPIRED sin consultar user', async () => {
    prismaMock.workshopInvitation.findUnique.mockResolvedValue({
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
    prismaMock.workshopInvitation.findUnique.mockResolvedValue({
      ...baseInvitation,
      status: 'accepted',
    });

    await expect(handler.execute('tok-1')).rejects.toMatchObject({
      status: 409,
    });
  });

  it('rechaza invitación cancelada con 409 INVITATION_CANCELLED', async () => {
    prismaMock.workshopInvitation.findUnique.mockResolvedValue({
      ...baseInvitation,
      status: 'cancelled',
    });

    await expect(handler.execute('tok-1')).rejects.toMatchObject({
      status: 409,
    });
  });

  it('rechaza invitación de taller ya activo como usada (409)', async () => {
    prismaMock.workshopInvitation.findUnique.mockResolvedValue({
      ...baseInvitation,
      workshop: { id: 'w1', name: 'Taller Norte', status: 'active' },
    });

    await expect(handler.execute('tok-1')).rejects.toMatchObject({
      status: 409,
    });
  });
});