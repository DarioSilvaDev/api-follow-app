import { Injectable } from '@nestjs/common';
import { CreateServiceRecordDto } from './dto/create-service-record.dto';
import { UpdateServiceRecordDto } from './dto/update-service-record.dto';

@Injectable()
export class ServiceRecordsService {
  create(createServiceRecordDto: CreateServiceRecordDto) {
    return 'This action adds a new serviceRecord';
  }

  findAll() {
    return `This action returns all serviceRecords`;
  }

  findOne(id: number) {
    return `This action returns a #${id} serviceRecord`;
  }

  update(id: number, updateServiceRecordDto: UpdateServiceRecordDto) {
    return `This action updates a #${id} serviceRecord`;
  }

  remove(id: number) {
    return `This action removes a #${id} serviceRecord`;
  }
}
