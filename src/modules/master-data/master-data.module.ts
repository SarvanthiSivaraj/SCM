import { Module, OnModuleInit } from '@nitrostack/core';
import { MasterDataService } from './master-data.service.js';
import { MasterDataTools } from './master-data.tools.js';

@Module({
  providers: [MasterDataService, MasterDataTools],
  exports: [MasterDataService],
})
export class MasterDataModule {}
