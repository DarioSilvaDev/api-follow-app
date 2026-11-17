import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { VEHICLE_REPOSITORY } from '../../tokens';
import type {
  RegisterVehiclePayload,
  VehicleRepository,
} from '../../repositories/vehicle.repository';
import { VehicleRegisteredEvent } from '../../events/vehicle-registered.event';
import { RegisterVehicleCommand } from './register-vehicle.command';
import { RegisterVehicleDto } from '../../dto/register-vehicle.dto';
import { PrismaService } from '../../../../common/database/prisma.service';
import { DealershipContext } from '../../../../common/context/interfaces/current-context.interface';
import { normalizeVin } from '../../../../common/validation/vin';
import { resolveCatalogBrandModel } from '../../utils/vehicle-catalog-pair';

/**
 * RegisterVehicleHandler — alta de vehículo (F-010), extendido por Gap 1
 * (D-128) para el stock propio de una concesionaria.
 *
 * El contexto activo decide la rama:
 * - PERSONAL   → alta clásica con owner (VehicleOwnership type=owner) y
 *   kilometraje actual OPCIONAL declarado por el propietario (D-206).
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

    // MVP sin versiones: `brandId`/`modelId` se resuelven en el catálogo y se
    // persisten como texto (`brandName`/`modelName`), con `versionId = null`.
    // Sin par de catálogo, los tres quedan null (opcional, D-038).
    const vehiclePayload = await this.prepareVehicleData(dto);
    console.log(
      '🚀 ~ RegisterVehicleHandler ~ execute ~ vehiclePayload:',
      vehiclePayload,
    );

    if (ctx.type === 'DEALERSHIP') {
      return this.registerFromDealership(
        vehiclePayload,
        command.userId,
        licensePlate,
        ctx,
      );
    }

    return this.registerFromPersonal(
      vehiclePayload,
      command.userId,
      licensePlate,
    );
  }

  /**
   * Resuelve el par marca/modelo del catálogo (ambos o ninguno) y prepara el
   * payload que consume el repositorio: sin `brandId`/`modelId`, con los
   * nombres resueltos y `versionId = null` (los vehículos nuevos no usan
   * versión; los legacy la conservan y no pasan por acá).
   */
  private async prepareVehicleData(
    dto: RegisterVehicleDto,
  ): Promise<RegisterVehiclePayload> {
    const catalog = await resolveCatalogBrandModel(this.prisma, dto);
    console.log(
      '🚀 ~ RegisterVehicleHandler ~ prepareVehicleData ~ catalog:',
      catalog,
    );
    return {
      // ...stripCatalogPair(dto),
      ...dto,
      brandName: catalog?.brandName ?? null,
      modelName: catalog?.modelName ?? null,
      versionId: null,
    };
  }

  /**
   * Alta clásica: el usuario autenticado queda como owner del vehículo.
   *
   * D-206: el propietario puede declarar el kilometraje actual del vehículo al
   * darlo de alta (es SU vehículo y conoce el dato). Es opcional; cuando viaja
   * se persiste como la primera lectura del odómetro (source=owner, D-146) en
   * la misma transacción que el vehículo y el ownership.
   */
  private async registerFromPersonal(
    vehiclePayload: RegisterVehiclePayload,
    userId: string,
    licensePlate: string,
  ) {
    console.log(
      '🚀 ~ RegisterVehicleHandler ~ registerFromPersonal ~ vehiclePayload:',
      vehiclePayload,
    );
    await this.assertPlateAvailable(licensePlate);

    const { initialMileage } = vehiclePayload;

    const vehicle =
      initialMileage !== undefined
        ? await this.repository.createPersonalRegistration({
            ...vehiclePayload,
            licensePlate,
            ownerId: userId,
            initialMileage,
          })
        : await this.repository.create({
            ...vehiclePayload,
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
    vehiclePayload: RegisterVehiclePayload,
    userId: string,
    licensePlate: string,
    ctx: DealershipContext,
  ) {
    const { initialMileage } = vehiclePayload;
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
      ...vehiclePayload,
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
