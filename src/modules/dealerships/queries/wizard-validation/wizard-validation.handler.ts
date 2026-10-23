import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../common/database/prisma.service';
import {
  InvitationCancelledException,
  InvitationExpiredException,
  InvitationInvalidException,
  InvitationUsedException,
} from '../../../../common/exceptions/coded.exception';

/**
 * D-106: validación pública del token del wizard de onboarding.
 * Los estados de la invitación se devuelven con códigos estables para que
 * el frontend muestre la pantalla correcta (formulario vs. expirada vs.
 * ya utilizada).
 *
 * D-TL-2/D-TL-4: si la concesionaria tiene taller vinculado (alta conjunta),
 * la respuesta agrega `workshop: { id, name }` para que el frontend renderice
 * el paso 2 del wizard (AC-3). El guard de `workshop.status !== 'pending_claim'`
 * es defensivo: por el flujo normal el taller y la concesionaria se reclaman
 * juntos, así que un taller ya activo con invitación pendiente es un estado
 * corrupto tratado como invitación usada.
 */
@Injectable()
export class WizardValidationHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(token: string) {
    const invitation = await this.prisma.dealershipInvitation.findUnique({
      where: { token },
      include: {
        dealership: {
          select: {
            id: true,
            name: true,
            status: true,
            workshop: { select: { id: true, name: true, status: true } },
          },
        },
      },
    });

    if (!invitation) throw new InvitationInvalidException();
    if (invitation.status === 'accepted') throw new InvitationUsedException();
    if (invitation.status === 'cancelled') {
      throw new InvitationCancelledException();
    }
    if (invitation.expiresAt < new Date())
      throw new InvitationExpiredException();
    if (invitation.dealership.status !== 'pending_claim') {
      // Invitación pendiente para una concesionaria ya reclamada (escenario
      // no alcanzable por el flujo normal): se trata como usada.
      throw new InvitationUsedException();
    }
    if (
      invitation.dealership.workshop &&
      invitation.dealership.workshop.status !== 'pending_claim'
    ) {
      // Taller vinculado ya reclamado con invitación pendiente: estado no
      // alcanzable por el flujo normal (el claim es conjunto y atómico).
      // Se trata como usada.
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

    const linkedWorkshop = invitation.dealership.workshop;

    return {
      valid: true,
      status: invitation.status,
      expiresAt: invitation.expiresAt,
      dealership: {
        id: invitation.dealershipId,
        name: invitation.dealership.name,
      },
      email: invitation.email,
      account: { exists: !!user, status: user?.status ?? null },
      // Registro para cuentas inexistentes o `pending`: el login de auth
      // rechaza las cuentas pending (401 INVALID_CREDENTIALS), así que el
      // wizard las reactiva mediante el registro completo (confianza vía
      // invitación admin: la cuenta no tiene credencial usable).
      requiresRegister: !user || user.status === 'pending',
      // D-TL-4: presente SOLO cuando hay taller vinculado pending_claim
      // (frontend renderiza 2 pasos — AC-3).
      ...(linkedWorkshop
        ? { workshop: { id: linkedWorkshop.id, name: linkedWorkshop.name } }
        : {}),
    };
  }
}
