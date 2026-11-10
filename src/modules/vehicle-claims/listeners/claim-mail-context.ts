import type { VehicleClaimOutcome } from '@prisma/client';
import { PrismaService } from '../../../common/database/prisma.service';

/**
 * C-4: helpers puros de lectura para los listeners de mail del reclamo.
 *
 * Sin DI ni estado: cada listener recibe `PrismaService` y re-lee la fila
 * `VehicleClaimInvite` por `inviteId`. Los eventos `vehicle-claim.*` no
 * transportan token ni hash (S-1), así que la correlación es siempre el id.
 */
export interface ClaimMailInvite {
  id: string;
  vehicleId: string;
  workshopId: string;
  careEpisodeId: string | null;
  claimantUserId: string | null;
  claimOutcome: VehicleClaimOutcome | null;
  vehicle: { licensePlate: string };
  workshop: { name: string; email: string | null };
  claimant: { firstName: string; lastName: string; email: string } | null;
}

/**
 * Re-lee el invite con exactamente los datos que necesitan los mails. Devuelve
 * `null` si la fila ya no existe (p. ej. vehículo borrado en hard-delete).
 */
export async function loadClaimMailInvite(
  prisma: PrismaService,
  inviteId: string,
): Promise<ClaimMailInvite | null> {
  return prisma.vehicleClaimInvite.findUnique({
    where: { id: inviteId },
    select: {
      id: true,
      vehicleId: true,
      workshopId: true,
      careEpisodeId: true,
      claimantUserId: true,
      claimOutcome: true,
      vehicle: { select: { licensePlate: true } },
      workshop: { select: { name: true, email: true } },
      claimant: { select: { firstName: true, lastName: true, email: true } },
    },
  });
}

/** Nombre para mostrar del reclamante, o `null` si no hay usuario. */
export function claimantName(
  user: { firstName: string; lastName: string } | null,
): string | null {
  if (!user) return null;
  const name = `${user.firstName} ${user.lastName}`.trim();
  return name || null;
}

/**
 * Titular activo del vehículo: ownership primario vigente (misma semántica
 * D-155 que el resto del módulo). Puede tener `user: null` si lo detenta una
 * concesionaria.
 */
export async function loadActiveOwner(
  prisma: PrismaService,
  vehicleId: string,
): Promise<{
  user: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
} | null> {
  return prisma.vehicleOwnership.findFirst({
    where: {
      vehicleId,
      endsAt: null,
      type: { not: 'co_owner' },
    },
    orderBy: { startsAt: 'desc' },
    select: {
      user: {
        select: { id: true, firstName: true, lastName: true, email: true },
      },
    },
  });
}

/**
 * `true` si el ownership creado por este invite ya fue cerrado. Es la guarda
 * que evita mandar "el reclamo fue revocado" cuando la revocación del taller
 * no llegó a deshacer un vínculo (T14: invite sin ownership).
 */
export async function wasClaimOwnershipUndone(
  prisma: PrismaService,
  inviteId: string,
): Promise<boolean> {
  const ownership = await prisma.vehicleOwnership.findFirst({
    where: {
      acquiredByClaimInviteId: inviteId,
      endsAt: { not: null },
    },
    select: { id: true },
  });
  return ownership !== null;
}
