import { Module } from '@nitrostack/core';
import { AnalyticsModule } from '../analytics/analytics.module.js';
import { MasterDataService } from './master-data.service.js';
import { MasterDataTools } from './master-data.tools.js';

@Module({
  name: 'master-data',
  imports: [AnalyticsModule],  // provides shared DatabaseService + MigrationService
  providers: [MasterDataService, MasterDataTools],
  exports: [MasterDataService, MasterDataTools],
})
export class MasterDataModule {}
