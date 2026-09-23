import {
  InvitationCancelledException,
  InvitationExpiredException,
  InvitationInvalidException,
  InvitationUsedException,
} from '../../../../common/exceptions/coded.exception';
import { hashPasswordResetToken } from '../../../auth/utils/token-hash.util';
import { UserWizardValidationHandler } from './wizard-validation.handler';

describe('UserWizardValidationHandler — D-106 preview wizard usuario plataforma', () => {
  let handler: UserWizardValidationHandler;
  let prismaMock: {
    userInvitation: { findUnique: jest.Mock };
    user: { findFirst: jest.Mock };
  };

  const invitation = {
    id: 'inv-1',
    email: 'nuevo@example.com',
    tokenHash: hashPasswordResetToken('tok-1'),
    status: 'pending',
    expiresAt: new Date(Date.now() + 100000),
    role: { type: 'admin', name: 'Admin' },
  };

  beforeEach(() => {
    prismaMock = {
      userInvitation: { findUnique: jest.fn() },
      user: { findFirst: jest.fn() },
    };
    handler = new UserWizardValidationHandler(prismaMock as any);
  });

  it('busca la invitación por el hash del token (nunca por token en claro)', async () => {
    prismaMock.userInvitation.findUnique.mockResolvedValue(invitation);
    prismaMock.user.findFirst.mockResolvedValue(null);

    await handler.execute('tok-1');

    expect(prismaMock.userInvitation.findUnique).toHaveBeenCalledWith({
      where: { tokenHash: hashPasswordResetToken('tok-1') },
      include: { role: { select: { type: true, name: true } } },
    });
  });

  it('404 si la invitación no existe', async () => {
    prismaMock.userInvitation.findUnique.mockResolvedValue(null);

    await expect(handler.execute('nope')).rejects.toThrow(
      InvitationInvalidException,
    );
  });

  it('409 si la invitación ya fue usada', async () => {
    prismaMock.userInvitation.findUnique.mockResolvedValue({
      ...invitation,
      status: 'used',
    });

    await expect(handler.execute('tok-1')).rejects.toThrow(
      InvitationUsedException,
    );
  });

  it('409 si la invitación fue cancelada', async () => {
    prismaMock.userInvitation.findUnique.mockResolvedValue({
      ...invitation,
      status: 'cancelled',
    });

    await expect(handler.execute('tok-1')).rejects.toThrow(
      InvitationCancelledException,
    );
  });

  it('400 si la invitación está vencida', async () => {
    prismaMock.userInvitation.findUnique.mockResolvedValue({
      ...invitation,
      expiresAt: new Date(Date.now() - 1000),
    });

    await expect(handler.execute('tok-1')).rejects.toThrow(
      InvitationExpiredException,
    );
  });

  it('devuelve requiresRegister true con el rol para cuenta inexistente', async () => {
    prismaMock.userInvitation.findUnique.mockResolvedValue(invitation);
    prismaMock.user.findFirst.mockResolvedValue(null);

    const result = await handler.execute('tok-1');

    expect(result).toEqual({
      valid: true,
      status: 'pending',
      expiresAt: invitation.expiresAt,
      role: { type: 'admin', name: 'Admin' },
      email: 'nuevo@example.com',
      account: { exists: false, status: null },
      requiresRegister: true,
    });
  });

  it('devuelve requiresRegister true para cuenta pending (se reactiva en el claim)', async () => {
    prismaMock.userInvitation.findUnique.mockResolvedValue(invitation);
    prismaMock.user.findFirst.mockResolvedValue({
      id: 'u1',
      status: 'pending',
    });

    const result = await handler.execute('tok-1');

    expect(result.account).toEqual({ exists: true, status: 'pending' });
    expect(result.requiresRegister).toBe(true);
  });

  it('devuelve requiresRegister false para cuenta activa', async () => {
    prismaMock.userInvitation.findUnique.mockResolvedValue(invitation);
    prismaMock.user.findFirst.mockResolvedValue({ id: 'u1', status: 'active' });

    const result = await handler.execute('tok-1');

    expect(result.account).toEqual({ exists: true, status: 'active' });
    expect(result.requiresRegister).toBe(false);
  });
});
