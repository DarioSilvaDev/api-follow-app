import {
  isUUID,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';

/**
 * MVP sin versiones: el alta/edición acepta `brandId` + `modelId` del catálogo
 * (ambos o ninguno). El validador se aplica a `modelId` para poder detectar
 * también el caso "brandId sin modelId" (cuando `modelId` está ausente, el
 * validador igual corre porque no está decorado con `@IsOptional`).
 *
 * Reglas:
 * - ambos ausentes/nulos → válido (catálogo opcional, D-038).
 * - uno sin el otro → inválido (400 con mensaje en español).
 * - ambos presentes → cada uno debe ser un UUID válido.
 */
@ValidatorConstraint({ name: 'IsValidBrandModelPair', async: false })
export class IsValidBrandModelPair implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments): boolean {
    const object = args.object as {
      brandId?: string | null;
      modelId?: string | null;
    };
    const brandId = object.brandId ?? null;
    const modelId = object.modelId ?? null;
    const hasBrand = brandId !== null;
    const hasModel = modelId !== null;

    if (hasBrand !== hasModel) return false;
    if (!hasBrand) return true;

    // El validador vive en `modelId`; la marca tiene su propio `@IsUUID()`.
    return (
      typeof modelId === 'string' &&
      isUUID(modelId) &&
      typeof brandId === 'string' &&
      isUUID(brandId)
    );
  }

  defaultMessage(args: ValidationArguments): string {
    const object = args.object as {
      brandId?: string | null;
      modelId?: string | null;
    };
    const hasBrand = (object.brandId ?? null) !== null;
    const hasModel = (object.modelId ?? null) !== null;

    if (hasBrand !== hasModel) {
      return 'brandId y modelId deben enviarse juntos';
    }
    return 'modelId debe ser un UUID válido';
  }
}
