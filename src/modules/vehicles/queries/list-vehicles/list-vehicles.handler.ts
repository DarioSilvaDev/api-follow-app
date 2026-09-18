import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../common/database/prisma.service';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../../../../common/constants';
import { VehicleResponseDto } from '../../dto/vehicle-response.dto';

interface ListVehiclesQuery {
  userId?: string;
  page?: number;
  limit?: number;
  q?: string;
}

@Injectable()
export class ListVehiclesHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(query: ListVehiclesQuery) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(
      Math.max(1, query.limit ?? DEFAULT_PAGE_SIZE),
      MAX_PAGE_SIZE,
    );
    const skip = (page - 1) * limit;

    // F-012 (D-044): búsqueda por placa parcial. `q` se combina con el scope
    // de ownership existente mediante AND. Guard `typeof`: `?q=a&q=b` llega
    // como array y `.trim()` explotaría. Mínimo 2 caracteres tras trim; con
    // menos, se comporta como sin `q` (RF-2). Hardening `slice(0, 20)` alinea
    // con `licensePlate @db.VarChar(20)`.
    const rawQ = typeof query.q === 'string' ? query.q : '';
    const q = rawQ.trim().length >= 2 ? rawQ.trim().slice(0, 20) : '';

    // M5 (D-107, §30 §3 / §29): el listado incluye ownership activo **O**
    // VehicleAccess vigente, siempre filtrado por userId del caller. Esto
    // permite que el vendedor durante la exhibición vea su vehículo
    // "en consignación" (banner D-107) sin ser ya titular.
    const now = new Date();
    const where: Prisma.VehicleWhereInput | undefined = query.userId
      ? {
          OR: [
            { ownerships: { some: { userId: query.userId, endsAt: null } } },
            {
              accesses: {
                some: {
                  userId: query.userId,
                  revokedAt: null,
                  OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
                },
              },
            },
          ],
          ...(q ? { licensePlate: { contains: q, mode: 'insensitive' } } : {}),
        }
      : undefined;

    const [vehicles, total] = await Promise.all([
      this.prisma.vehicle.findMany({
        where,
        skip,
        take: limit,
        include: {
          // F-010 (contrato list vs detail): desnormalizar brand/model/version
          // para que el listado use el mismo shape que VehicleResponseDto.
          version: {
            include: {
              model: {
                include: { brand: true },
              },
            },
          },
          ownerships: {
            where: { endsAt: null },
            include: {
              user: { select: { id: true, firstName: true, lastName: true } },
            },
          },
          photos: { where: { isPrimary: true }, take: 1 },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.vehicle.count({ where }),
    ]);

    return {
      data: vehicles.map((vehicle) => VehicleResponseDto.from(vehicle)),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }
}
