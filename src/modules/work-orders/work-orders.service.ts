import { Injectable } from '@nestjs/common';
import { CreateWorkOrderDto } from './dto/create-work-order.dto';
import { UpdateWorkOrderDto } from './dto/update-work-order.dto';

@Injectable()
export class WorkOrdersService {
  create(createWorkOrderDto: CreateWorkOrderDto) {
    return 'This action adds a new workOrder';
  }

  findAll() {
    return `This action returns all workOrders`;
  }

  findOne(id: number) {
    return `This action returns a #${id} workOrder`;
  }

  update(id: number, updateWorkOrderDto: UpdateWorkOrderDto) {
    return `This action updates a #${id} workOrder`;
  }

  remove(id: number) {
    return `This action removes a #${id} workOrder`;
  }
}
