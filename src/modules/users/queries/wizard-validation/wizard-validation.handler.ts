import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../common/database/prisma.service';
import {
  InvitationCancelledException,
  InvitationExpiredException,
  InvitationInvalidException,
  InvitationUsedException,
} from '../../../../common/exceptions/coded.exception';
import { hashPasswordResetToken } from '../../../auth/utils/token-hash.util';

/**
 * D-106: validación pública del token del wizard de usuario de plataforma.
 * El token se busca por su HASH (sha256); los estados de la invitación se
 * devuelven con códigos estables para que el frontend muestre la pantalla
 * correcta (formulario vs. expirada vs. ya utilizada).
 */
@Injectable()
export class UserWizardValidationHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(token: string) {
    const invitation = await this.prisma.userInvitation.findUnique({
      where: { tokenHash: hashPasswordResetToken(token) },
      include: {
        role: { select: { type: true, name: true } },
      },
    });

    if (!invitation) throw new InvitationInvalidException();
    if (invitation.status === 'used') throw new InvitationUsedException();
    if (invitation.status === 'cancelled') {
      throw new InvitationCancelledException();
    }
    if (invitation.expiresAt < new Date())
      throw new InvitationExpiredException();

    // Cuenta destino (case-insensitive, excluye borradas: D-106 "user
    // deletedAt → tratar como not exists").
    const user = await this.prisma.user.findFirst({
      where: {
        email: { equals: invitation.email, mode: 'insensitive' },
        deletedAt: null,
      },
      select: { id: true, status: true },
    });

    return {
      valid: true,
      status: invitation.status,
      expiresAt: invitation.expiresAt,
      role: {
        type: invitation.role.type,
        name: invitation.role.name,
      },
      email: invitation.email,
      account: { exists: !!user, status: user?.status ?? null },
      // Registro para cuentas inexistentes o pending (mismo criterio que el
      // wizard de dealerships: el claim crea o reactiva la cuenta).
      requiresRegister: !user || user.status === 'pending',
    };
  }
}