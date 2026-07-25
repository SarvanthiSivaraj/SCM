import { Module } from '@nitrostack/core';
import { MasterDataModule } from '../master-data/master-data.module.js';
import { IngestionModule } from '../ingestion/ingestion.module.js';
import { OrchestratorTools } from './orchestrator.tools.js';
import { ValidationService } from './validation.service.js';
import { ExceptionService } from './exception.service.js';

@Module({
  imports: [MasterDataModule, IngestionModule],
  providers: [ValidationService, ExceptionService, OrchestratorTools],
  exports: [],
})
export class OrchestratorModule {}
