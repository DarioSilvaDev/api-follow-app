import { Workshop } from '@prisma/client';
import { CreateWorkshopDto } from '../dto/create-workshop.dto';
import { UpdateWorkshopDto } from '../dto/update-workshop.dto';

export type CreateWorkshopData = CreateWorkshopDto & { ownerId: string };

export interface WorkshopRepository {
  create(data: CreateWorkshopData): Promise<Workshop>;
  update(id: string, data: UpdateWorkshopDto): Promise<Workshop>;
  findById(id: string): Promise<Workshop | null>;
}
