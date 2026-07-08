import { Injectable } from '@nestjs/common';
import { CreateOwnershipDto } from './dto/create-ownership.dto';
import { UpdateOwnershipDto } from './dto/update-ownership.dto';

@Injectable()
export class OwnershipsService {
  create(createOwnershipDto: CreateOwnershipDto) {
    return 'This action adds a new ownership';
  }

  findAll() {
    return `This action returns all ownerships`;
  }

  findOne(id: number) {
    return `This action returns a #${id} ownership`;
  }

  update(id: number, updateOwnershipDto: UpdateOwnershipDto) {
    return `This action updates a #${id} ownership`;
  }

  remove(id: number) {
    return `This action removes a #${id} ownership`;
  }
}
