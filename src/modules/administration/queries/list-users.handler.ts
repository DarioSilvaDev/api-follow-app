import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, SystemRoleType, MemberStatus } from '@prisma/client';
import { PrismaService } from '../../../common/database/prisma.service';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../../../common/constants';

interface ListUsersQuery {
  page?: number;
  limit?: number;
  q?: string;
  status?: string;
  role?: string;
  membership?: string;
}

const USER_STATUS_FILTERS = ['pending', 'active', 'suspended'] as const;
const PLATFORM_ROLE_FILTERS = ['admin', 'support'] as const;
// Filtro por vínculo del usuario con el ecosistema (panel superadmin).
const MEMBERSHIP_FILTERS = [
  'workshop',
  'dealership',
  'vehicle',
  'none',
] as const;

@Injectable()
export class ListUsersHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(query: ListUsersQuery) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(
      Math.max(1, query.limit ?? DEFAULT_PAGE_SIZE),
      MAX_PAGE_SIZE,
    );
    const skip = (page - 1) * limit;

    const where: Prisma.UserWhereInput = {};

    // Búsqueda de texto libre por email/nombre. Igual que search-workshops:
    // menos de 2 caracteres es un error de validación explícito (400), no
    // un filtro vacío silencioso.
    if (query.q !== undefined) {
      const q = query.q.trim();
      if (q.length < 2) {
        throw new BadRequestException(
          'El filtro q debe tener al menos 2 caracteres',
        );
      }
      where.OR = [
        { email: { contains: q, mode: 'insensitive' } },
        { firstName: { contains: q, mode: 'insensitive' } },
        { lastName: { contains: q, mode: 'insensitive' } },
      ];
    }

    if (query.status !== undefined) {
      const valid = (USER_STATUS_FILTERS as readonly string[]).includes(
        query.status,
      );
      if (!valid) {
        throw new BadRequestException(
          `El filtro status debe ser uno de: ${USER_STATUS_FILTERS.join(', ')}`,
        );
      }
      where.status = query.status as Prisma.UserWhereInput['status'];
    }

    // Filtro por rol de plataforma (admin/support): los roles asignables
    // desde el panel. Se aplica sobre el systemRoleAssignment vigente.
    if (query.role !== undefined) {
      const valid = (PLATFORM_ROLE_FILTERS as readonly string[]).includes(
        query.role,
      );
      if (!valid) {
        throw new BadRequestException(
          `El filtro role debe ser uno de: ${PLATFORM_ROLE_FILTERS.join(', ')}`,
        );
      }
      where.systemRoleAssignments = {
        some: { role: { type: query.role as SystemRoleType } },
      };
    }

    if (query.membership !== undefined) {
      const valid = (MEMBERSHIP_FILTERS as readonly string[]).includes(
        query.membership,
      );
      if (!valid) {
        throw new BadRequestException(
          `El filtro membership debe ser uno de: ${MEMBERSHIP_FILTERS.join(', ')}`,
        );
      }
      switch (query.membership) {
        case 'workshop':
          where.workshopMemberships = {
            some: { status: MemberStatus.active },
          };
          break;
        case 'dealership':
          where.dealershipMemberships = {
            some: { status: MemberStatus.active },
          };
          break;
        case 'vehicle':
          where.ownerships = { some: { endsAt: null } };
          break;
        case 'none':
          where.AND = [
            { workshopMemberships: { none: { status: MemberStatus.active } } },
            {
              dealershipMemberships: {
                none: { status: MemberStatus.active },
              },
            },
            { ownerships: { none: { endsAt: null } } },
          ];
          break;
      }
    }

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        include: {
          systemRoleAssignments: {
            include: { role: true },
          },
        },
        // P5: pendientes primero (orden del enum en PG), luego los más
        // recientes — espejo de workshops/dealerships.
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      }),
      this.prisma.user.count({ where }),
    ]);

    // Conteos por usuario para la tabla del panel (talleres / concesionarias
    // activas / tenencias vigentes). Se resuelven con 3 `groupBy` acotados a
    // la página actual — no hacen N+1.
    const ids = users.map((u) => u.id);
    const countsByUserId = new Map<
      string,
      { workshops: number; dealerships: number; vehicles: number }
    >();
    if (ids.length > 0) {
      const [workshopCounts, dealershipCounts, vehicleCounts] =
        await Promise.all([
          this.prisma.workshopMember.groupBy({
            by: ['userId'],
            where: { userId: { in: ids }, status: MemberStatus.active },
            _count: { _all: true },
          }),
          this.prisma.dealershipMember.groupBy({
            by: ['userId'],
            where: { userId: { in: ids }, status: MemberStatus.active },
            _count: { _all: true },
          }),
          this.prisma.vehicleOwnership.groupBy({
            by: ['userId'],
            where: { userId: { in: ids }, endsAt: null },
            _count: { _all: true },
          }),
        ]);

      for (const row of workshopCounts) {
        const entry = countsByUserId.get(row.userId) ?? {
          workshops: 0,
          dealerships: 0,
          vehicles: 0,
        };
        entry.workshops = row._count._all;
        countsByUserId.set(row.userId, entry);
      }
      for (const row of dealershipCounts) {
        const entry = countsByUserId.get(row.userId) ?? {
          workshops: 0,
          dealerships: 0,
          vehicles: 0,
        };
        entry.dealerships = row._count._all;
        countsByUserId.set(row.userId, entry);
      }
      for (const row of vehicleCounts) {
        if (!row.userId) continue;
        const entry = countsByUserId.get(row.userId) ?? {
          workshops: 0,
          dealerships: 0,
          vehicles: 0,
        };
        entry.vehicles = row._count._all;
        countsByUserId.set(row.userId, entry);
      }
    }

    const data = users.map((user) => ({
      ...user,
      _counts: countsByUserId.get(user.id) ?? {
        workshops: 0,
        dealerships: 0,
        vehicles: 0,
      },
    }));

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }
}
