import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { OwnershipsService } from './ownerships.service';
import { CreateOwnershipDto } from './dto/create-ownership.dto';
import { UpdateOwnershipDto } from './dto/update-ownership.dto';

@Controller('ownerships')
export class OwnershipsController {
  constructor(private readonly ownershipsService: OwnershipsService) {}

  @Post()
  create(@Body() createOwnershipDto: CreateOwnershipDto) {
    return this.ownershipsService.create(createOwnershipDto);
  }

  @Get()
  findAll() {
    return this.ownershipsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.ownershipsService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateOwnershipDto: UpdateOwnershipDto) {
    return this.ownershipsService.update(+id, updateOwnershipDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.ownershipsService.remove(+id);
  }
}
