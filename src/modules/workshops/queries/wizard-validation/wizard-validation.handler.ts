import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../common/database/prisma.service';
import {
  InvitationCancelledException,
  InvitationExpiredException,
  InvitationInvalidException,
  InvitationUsedException,
} from '../../../../common/exceptions/coded.exception';

/**
 * D-106: validación pública del token del wizard de onboarding de taller.
 * Los estados de la invitación se devuelven con códigos estables para que
 * el frontend muestre la pantalla correcta (formulario vs. expirada vs.
 * ya utilizada).
 */
@Injectable()
export class WizardValidationHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(token: string) {
    const invitation = await this.prisma.workshopInvitation.findUnique({
      where: { token },
      include: {
        workshop: { select: { id: true, name: true, status: true } },
      },
    });

    if (!invitation) throw new InvitationInvalidException();
    if (invitation.status === 'accepted') throw new InvitationUsedException();
    if (invitation.status === 'cancelled') {
      throw new InvitationCancelledException();
    }
    if (invitation.expiresAt < new Date())
      throw new InvitationExpiredException();
    if (invitation.workshop.status !== 'pending_claim') {
      // Invitación pendiente para un taller ya reclamado (escenario no
      // alcanzable por el flujo normal): se trata como usada.
      throw new InvitationUsedException();
    }

    // Cuenta del dueño (case-insensitive, excluye borradas: D-106 "user
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
      workshop: {
        id: invitation.workshopId,
        name: invitation.workshop.name,
      },
      email: invitation.email,
      account: { exists: !!user, status: user?.status ?? null },
      // Registro para cuentas inexistentes o `pending`: el login de auth
      // rechaza las cuentas pending (401 INVALID_CREDENTIALS), así que el
      // wizard las reactiva mediante el registro completo (confianza vía
      // invitación admin: la cuenta no tiene credencial usable).
      requiresRegister: !user || user.status === 'pending',
    };
  }
}