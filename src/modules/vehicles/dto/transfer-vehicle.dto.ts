import { Type } from 'class-transformer';
import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Validate,
  ValidateIf,
  ValidateNested,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
  isEmail,
} from 'class-validator';

/**
 * Contrato PM (transferencia por email o por alias):
 * `POST /vehicles/:id/transfer` → `{ recipient: { type, value }, notes? }`
 *
 * - `type: 'email'` → `value` se valida como email y se busca tal cual
 *   (comportamiento histórico conservado).
 * - `type: 'alias'` → `value` acepta mayúsculas (`^[a-zA-Z0-9._-]{3,30}$`);
 *   el handler normaliza SIEMPRE con `trim().toLowerCase()` y resuelve con
 *   `user.findUnique({ where: { alias: normalized } })`.
 *
 * Nota de implementación: los múltiples `@ValidateIf` sobre la misma
 * propiedad se combinan con AND en class-validator, por lo que no es viable
 * `@IsEmail`/`@Matches` condicionales por separado. Se utiliza un constraint
 * custom que ramifica por `type` con exactamente las mismas reglas
 * (`isEmail()` para email; regex del contrato para alias).
 */
export const TRANSFER_RECIPIENT_TYPE_EMAIL = 'email';
export const TRANSFER_RECIPIENT_TYPE_ALIAS = 'alias';

/** D-077 / contrato PM: alias aceptando mayúsculas (el handler normaliza). */
export const TRANSFER_RECIPIENT_ALIAS_PATTERN = /^[a-zA-Z0-9._-]{3,30}$/;

@ValidatorConstraint({ name: 'transferRecipientValue', async: false })
class TransferRecipientValueValidator implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments): boolean {
    const recipient = args.object as TransferRecipientDto;
    if (typeof value !== 'string') return false;
    if (recipient.type === TRANSFER_RECIPIENT_TYPE_EMAIL) {
      return isEmail(value);
    }
    if (recipient.type === TRANSFER_RECIPIENT_TYPE_ALIAS) {
      return TRANSFER_RECIPIENT_ALIAS_PATTERN.test(value);
    }
    return false;
  }

  defaultMessage(args: ValidationArguments): string {
    const recipient = args.object as TransferRecipientDto;
    if (recipient.type === TRANSFER_RECIPIENT_TYPE_EMAIL) {
      return 'recipient.value must be a valid email';
    }
    if (recipient.type === TRANSFER_RECIPIENT_TYPE_ALIAS) {
      return 'recipient.value must be a valid alias (3-30 chars: letters, digits, . _ -)';
    }
    return 'recipient.value does not match the recipient type';
  }
}

export class TransferRecipientDto {
  /** Discriminador: 'email' | 'alias' (patrón generate-transfer-qr.dto.ts). */
  @IsNotEmpty()
  @IsIn([TRANSFER_RECIPIENT_TYPE_EMAIL, TRANSFER_RECIPIENT_TYPE_ALIAS])
  type!: 'email' | 'alias';

  /**
   * Valor según `type`. Si `type` es desconocido, el error de `type`
   * (IsIn) ya produce el 400 de validación; no se exige `value`.
   */
  @ValidateIf(
    (o: TransferRecipientDto) =>
      o.type === TRANSFER_RECIPIENT_TYPE_EMAIL ||
      o.type === TRANSFER_RECIPIENT_TYPE_ALIAS,
  )
  @IsString()
  @IsNotEmpty()
  @Validate(TransferRecipientValueValidator)
  value!: string;
}

export class TransferVehicleDto {
  @IsNotEmpty()
  @ValidateNested()
  @Type(() => TransferRecipientDto)
  recipient!: TransferRecipientDto;

  @IsOptional()
  @IsString()
  notes?: string;
}
