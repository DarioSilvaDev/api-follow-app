import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../common/database/prisma.service';
import { envs } from '../../../../config/envs';
import { buildE164, isValidPair } from '../../../../common/phone/phone.util';
import { UserUpdatedEvent } from '../../events/user-updated.event';
import { UpdateMyProfileCommand } from './update-my-profile.command';
import type { MyProfileResponse } from './my-profile.response';

/**
 * PATCH /users/me — el usuario autenticado edita SUS datos personales.
 *
 * Alcance deliberado: firstName, lastName y celular (D-173). Nada más.
 * - Celular: dos inputs (área + número), país fijo DEFAULT_PHONE_COUNTRY_CODE,
 *   persistencia E.164 en `phone` + split display en `phoneAreaCode` /
 *   `phoneNationalNumber`. `phone: null` (o ambos campos vacíos) limpia.
 *   Sin longitud fija; validación en par (ambos ≥ 2 dígitos → 400).
 * - Campos no enviados (`undefined`) no se tocan; `{}` → no-op.
 * - Emite `user.updated` (mismo contrato que UpdateUserHandler) para que los
 *   listeners existentes (cachés, etc.) reaccionen.
 */
@Injectable()
export class UpdateMyProfileHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async execute(command: UpdateMyProfileCommand): Promise<MyProfileResponse> {
    const { userId, dto } = command;

    const data: Prisma.UserUpdateInput = {};

    if (dto.firstName !== undefined) {
      data.firstName = dto.firstName.trim();
    }
    if (dto.lastName !== undefined) {
      data.lastName = dto.lastName.trim();
    }

    if (dto.phone !== undefined) {
      if (dto.phone === null) {
        data.phone = null;
        data.phoneAreaCode = '';
        data.phoneNationalNumber = '';
      } else {
        const areaCode = (dto.phone.areaCode ?? '').replace(/\D/g, '');
        const nationalNumber = (dto.phone.nationalNumber ?? '').replace(
          /\D/g,
          '',
        );
        const wantsPhone = areaCode.length > 0 || nationalNumber.length > 0;

        if (!wantsPhone) {
          // Ambos vacíos → limpiar (equivalente a phone: null).
          data.phone = null;
          data.phoneAreaCode = '';
          data.phoneNationalNumber = '';
        } else {
          if (!isValidPair({ areaCode, nationalNumber })) {
            throw new BadRequestException(
              'Ingresá un celular válido (código de área y número)',
            );
          }
          const e164 = buildE164({
            areaCode,
            nationalNumber,
            countryCode: envs.DEFAULT_PHONE_COUNTRY_CODE,
          });
          if (!e164) {
            throw new BadRequestException(
              'Ingresá un celular válido (código de área y número)',
            );
          }
          data.phone = e164;
          data.phoneAreaCode = areaCode;
          data.phoneNationalNumber = nationalNumber;
        }
      }
    }

    // Nada que actualizar → devolver el estado actual sin escribir ni emitir.
    if (Object.keys(data).length === 0) {
      const current = await this.prisma.user.findUnique({
        where: { id: userId },
        select: this.responseSelect,
      });
      if (!current) {
        throw new NotFoundException('User not found');
      }
      return current;
    }

    let updated: MyProfileResponse;
    try {
      updated = await this.prisma.user.update({
        where: { id: userId },
        data,
        select: this.responseSelect,
      });
    } catch (error) {
      // P2025 = record not found (la cuenta ya no existe).
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException('User not found');
      }
      throw error;
    }

    this.eventEmitter.emit('user.updated', new UserUpdatedEvent(updated.id));

    return updated;
  }

  private readonly responseSelect = {
    id: true,
    firstName: true,
    lastName: true,
    phone: true,
    phoneAreaCode: true,
    phoneNationalNumber: true,
  } satisfies Prisma.UserSelect;
}
