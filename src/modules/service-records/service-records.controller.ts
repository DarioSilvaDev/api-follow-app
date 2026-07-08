import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { ServiceRecordsService } from './service-records.service';
import { CreateServiceRecordDto } from './dto/create-service-record.dto';
import { UpdateServiceRecordDto } from './dto/update-service-record.dto';

@Controller('service-records')
export class ServiceRecordsController {
  constructor(private readonly serviceRecordsService: ServiceRecordsService) {}

  @Post()
  create(@Body() createServiceRecordDto: CreateServiceRecordDto) {
    return this.serviceRecordsService.create(createServiceRecordDto);
  }

  @Get()
  findAll() {
    return this.serviceRecordsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.serviceRecordsService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateServiceRecordDto: UpdateServiceRecordDto) {
    return this.serviceRecordsService.update(+id, updateServiceRecordDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.serviceRecordsService.remove(+id);
  }
}
