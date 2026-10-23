import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { VEHICLE_REPOSITORY } from '../../tokens';
import type { VehicleRepository } from '../../repositories/vehicle.repository';
import { VehicleRegisteredEvent } from '../../events/vehicle-registered.event';
import { RegisterVehicleCommand } from './register-vehicle.command';
import { RegisterVehicleDto } from '../../dto/register-vehicle.dto';
import { PrismaService } from '../../../../common/database/prisma.service';
import { DealershipContext } from '../../../../common/context/interfaces/current-context.interface';
import { normalizeVin } from '../../../../common/validation/vin';

/**
 * RegisterVehicleHandler — alta de vehículo (F-010), extendido por Gap 1
 * (D-128) para el stock propio de una concesionaria.
 *
 * El contexto activo decide la rama:
 * - PERSONAL   → alta clásica con owner (VehicleOwnership type=owner).
 * - DEALERSHIP → alta de stock propio: exige `initialMileage` y el permiso
 *   `dealership.vehicle.create`; crea en una transacción el Vehicle, el
 *   ownership company y el kilometraje inicial auditado (ver repositorio).
 * - WORKSHOP / PLATFORM → 403 fail-closed (el alta no aplica en esos contextos).
 */
@Injectable()
export class RegisterVehicleHandler {
  constructor(
    @Inject(VEHICLE_REPOSITORY)
    private readonly repository: VehicleRepository,
    private readonly eventEmitter: EventEmitter2,
    private readonly prisma: PrismaService,
  ) {}

  async execute(command: RegisterVehicleCommand) {
    // D-037: normalizar placa (trim + mayúsculas) antes de buscar y de guardar,
    // para impedir duplicados tipo "abc123" vs "ABC123".
    const licensePlate = command.dto.licensePlate.trim().toUpperCase();
    const ctx = command.ctx;

    // D-145/D-132: normalizar VIN (trim + mayúsculas) antes de persistir. El
    // DTO valida el formato (IsValidVin); la normalización vive aquí, única
    // fuente de verdad (igual criterio que la placa, D-037). Sin VIN no-op.
    const rawVin = command.dto.vin;
    const dto: RegisterVehicleDto = rawVin
      ? { ...command.dto, vin: normalizeVin(rawVin) }
      : command.dto;

    // §4.3: el alta solo está disponible en PERSONAL y DEALERSHIP. En cualquier
    // otro contexto se rechaza (fail-closed) sin resolver membresía ni persistir.
    if (ctx.type === 'WORKSHOP' || ctx.type === 'PLATFORM') {
      throw new ForbiddenException(
        'La operación no está permitida desde este contexto',
      );
    }

    if (ctx.type === 'DEALERSHIP') {
      return this.registerFromDealership(dto, command.userId, licensePlate, ctx);
    }

    return this.registerFromPersonal(dto, command.userId, licensePlate);
  }

  /** Alta clásica: el usuario autenticado queda como owner del vehículo. */
  private async registerFromPersonal(
    dto: RegisterVehicleDto,
    userId: string,
    licensePlate: string,
  ) {
    // D-07: el kilometraje inicial es exclusivo del alta por concesionaria.
    if (dto.initialMileage !== undefined) {
      throw new BadRequestException(
        'El kilometraje inicial solo aplica al alta de vehículos por concesionaria',
      );
    }

    await this.assertPlateAvailable(licensePlate);

    const vehicle = await this.repository.create({
      ...dto,
      licensePlate,
      ownerId: userId,
    });

    this.emitRegistered(vehicle, userId);
    return vehicle;
  }

  /**
   * Gap 1: alta de stock propio por concesionaria. El contexto DEALERSHIP ya
   * garantiza `dealershipId`/`memberId`; aquí se enforcea el permiso de rol y se
   * exige el kilometraje inicial.
   */
  private async registerFromDealership(
    dto: RegisterVehicleDto,
    userId: string,
    licensePlate: string,
    ctx: DealershipContext,
  ) {
    const { initialMileage } = dto;
    if (
      initialMileage === undefined ||
      !Number.isInteger(initialMileage) ||
      initialMileage < 0
    ) {
      throw new BadRequestException(
        'El kilometraje inicial es obligatorio (entero mayor o igual a 0) para el alta de vehículos por concesionaria',
      );
    }

    await this.assertMemberCanCreate(ctx);
    await this.assertPlateAvailable(licensePlate);

    const vehicle = await this.repository.createDealershipRegistration({
      ...dto,
      licensePlate,
      dealershipId: ctx.dealershipId,
      dealershipMemberId: ctx.memberId,
      recordedByUserId: userId,
      initialMileage,
    });

    this.emitRegistered(vehicle, userId);
    return vehicle;
  }

  /** D-036: pre-check de placa (el unique constraint sigue siendo la red final). */
  private async assertPlateAvailable(licensePlate: string): Promise<void> {
    const existing = await this.repository.findByLicensePlate(licensePlate);
    if (existing) {
      throw new ConflictException(
        'Ya existe un vehículo registrado con esa placa',
      );
    }
  }

  private emitRegistered(
    vehicle: { id: string; licensePlate: string },
    actorUserId: string,
  ): void {
    // El evento representa el hecho "vehículo registrado". Para el alta por
    // concesionaria se mantiene el shape existente (id, ownerId, placa): se pasa
    // el userId del actor. Emitido solo DESPUÉS de que la persistencia confirmó.
    this.eventEmitter.emit(
      'vehicle.registered',
      new VehicleRegisteredEvent(vehicle.id, actorUserId, vehicle.licensePlate),
    );
  }

  /**
   * Gap 1 / §4.2: solo un miembro ACTIVO de la concesionaria del contexto, cuyo
   * rol tenga `dealership.vehicle.create`, puede dar de alta stock propio.
   * Patrón espejo de `AcceptConsignmentTakeQrHandler.assertMemberCanTake`
   * (membresía activa + concesionaria activa + permiso de rol).
   */
  private async assertMemberCanCreate(ctx: DealershipContext): Promise<void> {
    const member = await this.prisma.dealershipMember.findUnique({
      where: {
        dealershipId_userId: {
          dealershipId: ctx.dealershipId,
          userId: ctx.userId,
        },
      },
      include: {
        role: {
          include: {
            permissions: { include: { permission: true } },
          },
        },
        dealership: { select: { isActive: true } },
      },
    });

    if (!member || member.status !== 'active') {
      throw new ForbiddenException(
        'You are not an active member of this dealership',
      );
    }

    if (!member.dealership.isActive) {
      throw new ForbiddenException('This dealership is inactive');
    }

    const hasPermission = member.role.permissions.some(
      (rp) => rp.permission.code === 'dealership.vehicle.create',
    );
    if (!hasPermission) {
      throw new ForbiddenException('Missing required permissions');
    }
  }
}
