import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

const CUIT_WEIGHTS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

export function normalizeTaxId(taxId: string | null | undefined): string {
  if (!taxId) return '';
  return taxId.replace(/\D/g, '');
}

export function isValidArgentineTaxId(taxId: string | null | undefined): boolean {
  const normalized = normalizeTaxId(taxId);
  if (normalized.length !== 11) {
    return false;
  }

  let sum = 0;
  for (let i = 0; i < 10; i++) {
    const digit = parseInt(normalized[i], 10);
    if (Number.isNaN(digit)) {
      return false;
    }
    sum += digit * CUIT_WEIGHTS[i];
  }

  const mod = sum % 11;
  let verifier: number;
  if (mod === 0) {
    verifier = 0;
  } else if (mod === 1) {
    verifier = 9;
  } else {
    verifier = 11 - mod;
  }

  const lastDigit = parseInt(normalized[10], 10);
  if (Number.isNaN(lastDigit)) {
    return false;
  }

  return verifier === lastDigit;
}

@ValidatorConstraint({ name: 'isValidTaxId', async: false })
export class IsValidTaxIdConstraint implements ValidatorConstraintInterface {
  validate(value: unknown, _args: ValidationArguments): boolean {
    if (value === null || value === undefined || value === '') {
      return true;
    }
    if (typeof value !== 'string') {
      return false;
    }
    return isValidArgentineTaxId(value);
  }

  defaultMessage(_args: ValidationArguments): string {
    return 'taxId must be a valid Argentine CUIT/CUIL';
  }
}

export function IsValidTaxId(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsValidTaxIdConstraint,
    });
  };
}
