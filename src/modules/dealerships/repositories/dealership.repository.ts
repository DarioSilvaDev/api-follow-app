import { Dealership } from '@prisma/client';
import { CreateDealershipDto } from '../dto/create-dealership.dto';
import { UpdateDealershipDto } from '../dto/update-dealership.dto';

export type CreateDealershipData = CreateDealershipDto & { ownerId: string };

export interface DealershipRepository {
  create(data: CreateDealershipData): Promise<Dealership>;
  update(id: string, data: UpdateDealershipDto): Promise<Dealership>;
  findById(id: string): Promise<Dealership | null>;
}