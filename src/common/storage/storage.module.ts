import { Module, Global } from '@nestjs/common';
import { StorageR2Service } from './storage-r2.service';
import { StorageB2Service } from './storage-b2.service';

@Global()
@Module({
  providers: [StorageR2Service, StorageB2Service],
  exports: [StorageR2Service, StorageB2Service],
})
export class StorageModule {}
