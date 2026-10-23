import {
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { isValidVin } from '../../../../common/validation/vin';

@ValidatorConstraint({ name: 'IsValidVin', async: false })
export class IsValidVin implements ValidatorConstraintInterface {
  validate(vin: unknown): boolean {
    if (typeof vin !== 'string') return false;
    return isValidVin(vin);
  }

  defaultMessage(): string {
    return 'VIN debe tener 17 caracteres alfanuméricos (sin I, O, Q)';
  }
}
