import { VehicleMileage } from '@prisma/client';

export type RecordedByKind = 'user' | 'workshop' | 'dealership';

/**
 * Lectura de kilometraje con su atribución (Gap 1 — D-01/D-11).
 *
 * Las FK internas (`recordedByUserId`, `recordedByWorkshopMemberId`,
 * `recordedByDealership*`) NO se exponen: se normalizan en `recordedBy`.
 * Para `dealership` no se expone el nombre del empleado (D-107).
 */
type MileageAttribution = VehicleMileage & {
  recordedByUser?: { id: string; firstName: string; lastName: string } | null;
  recordedByDealership?: { id: string; name: string } | null;
  recordedByWorkshopMember?: {
    id: string;
    user?: { id: string; firstName: string; lastName: string } | null;
    workshop?: { id: string; name: string } | null;
  } | null;
};

function fullName(
  user?: { firstName: string; lastName: string } | null,
): string | null {
  if (!user) return null;
  const name = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim();
  return name.length > 0 ? name : null;
}

export class VehicleMileageResponseDto {
  id!: string;
  mileage!: number;
  source!: string;
  notes!: string | null;
  recordedAt!: Date;
  recordedBy!: {
    kind: RecordedByKind;
    id: string;
    displayName: string | null;
  };

  static from(mileage: MileageAttribution): VehicleMileageResponseDto {
    let kind: RecordedByKind = 'user';
    let id = mileage.recordedByUserId ?? mileage.id;
    let displayName: string | null = null;

    if (mileage.recordedByDealershipId && mileage.recordedByDealership) {
      kind = 'dealership';
      id = mileage.recordedByDealership.id;
      // D-107 / RB-08: solo la concesionaria, nunca el nombre del empleado.
      displayName = mileage.recordedByDealership.name;
    } else if (
      mileage.recordedByWorkshopMemberId &&
      mileage.recordedByWorkshopMember
    ) {
      kind = 'workshop';
      id = mileage.recordedByWorkshopMember.id;
      displayName =
        mileage.recordedByWorkshopMember.workshop?.name ??
        fullName(mileage.recordedByWorkshopMember.user);
    } else if (mileage.recordedByUserId) {
      kind = 'user';
      id = mileage.recordedByUserId;
      displayName = fullName(mileage.recordedByUser);
    }

    return {
      id: mileage.id,
      mileage: mileage.mileage,
      source: mileage.source,
      notes: mileage.notes,
      recordedAt: mileage.recordedAt,
      recordedBy: { kind, id, displayName },
    };
  }
}
