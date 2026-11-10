import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../common/database/prisma.service';

export interface ServiceTypeItem {
  id: string;
  code: string;
  name: string;
}

export interface ServiceTypesResult {
  data: ServiceTypeItem[];
  /**
   * `true` cuando el taller no cargó especialidades: se devuelve el catálogo
   * completo y la UI muestra el aviso de onboarding (RF-9).
   */
  onboardingRequired: boolean;
}

/**
 * ListServiceTypesHandler — GET /api/care-episodes/service-types (B-2).
 *
 * Devuelve el catálogo activo filtrado por la UNIÓN de especialidades del
 * taller del contexto (M:N `ServiceTypeSpecialty`). Sin especialidades → todo
 * el catálogo activo + `onboardingRequired: true`.
 */
@Injectable()
export class ListServiceTypesHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(workshopId: string): Promise<ServiceTypesResult> {
    const specialties = await this.prisma.workshopSpecialty.findMany({
      where: { workshopId },
      select: { specialtyId: true },
    });

    const onboardingRequired = specialties.length === 0;
    const specialtyIds = specialties.map((s) => s.specialtyId);

    const serviceTypes = await this.prisma.serviceType.findMany({
      where: {
        isActive: true,
        ...(onboardingRequired
          ? {}
          : { specialties: { some: { specialtyId: { in: specialtyIds } } } }),
      },
      select: { id: true, code: true, name: true },
      orderBy: { name: 'asc' },
    });

    return { data: serviceTypes, onboardingRequired };
  }
}
