import { NotFoundException as NestNotFoundException } from '@nestjs/common';

export class NotFoundException extends NestNotFoundException {
  constructor(resource: string, id: string) {
    super(`${resource} with id '${id}' not found`);
  }
}
