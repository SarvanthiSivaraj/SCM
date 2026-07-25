import { Module } from '@nitrostack/core';
import { MasterDataModule } from '../master-data/master-data.module.js';
import { IngestionModule } from '../ingestion/ingestion.module.js';
import { OrchestratorTools } from './orchestrator.tools.js';
import { ValidationService } from './validation.service.js';
import { ExceptionService } from './exception.service.js';
import { WorkflowEngine } from './workflow.engine.js';
import { WorkflowContextStore } from './workflow-context.store.js';
import { SopLoaderService } from './sop-loader.service.js';

@Module({
  name: 'orchestrator',
  imports: [MasterDataModule, IngestionModule],
  providers: [
    // Core orchestrator services
    SopLoaderService,          // reads sop_rules.yaml on boot
    WorkflowContextStore,      // in-memory run tracker
    WorkflowEngine,            // YAML-driven step executor
    ValidationService,         // invoice ↔ PO field comparison
    ExceptionService,          // exception log writer
    // Tools (exposes MCP endpoints)
    OrchestratorTools,
  ],
  exports: [],
})
export class OrchestratorModule {}
