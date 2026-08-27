import { Specialty } from '@prisma/client';

export class SpecialtyResponseDto {
  id!: string;
  code!: string;
  name!: string;
  description!: string | null;

  static from(specialty: Specialty): SpecialtyResponseDto {
    return {
      id: specialty.id,
      code: specialty.code,
      name: specialty.name,
      description: specialty.description,
    };
  }
}
