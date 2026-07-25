import { McpApp, Module, ConfigModule, ApiKeyModule } from '@nitrostack/core';
import { SystemHealthCheck } from './health/system.health.js';
import { IngestionModule } from './modules/ingestion/ingestion.module.js';
import { MasterDataModule } from './modules/master-data/master-data.module.js';
import { OrchestratorModule } from './modules/orchestrator/orchestrator.module.js';

/**
 * ALE SCM — MCP Server Root Module
 *
 * Modules:
 *  - IngestionModule    (Person A) classify, extract
 *  - MasterDataModule   (Person B) PO lookup, HS-code stub
 *  - OrchestratorModule (Person C) workflow, validation, exceptions
 *  - ApiKeyModule       (Person D) x-api-key guard
 */
@McpApp({
  module: AppModule,
  server: {
    name: 'ale-scm-server',
    version: '1.0.0',
  },
  logging: {
    level: 'info',
  },
})
@Module({
  name: 'app',
  description: 'ALE SCM MCP root module',
  imports: [
    ConfigModule.forRoot(),
    ApiKeyModule.forRoot({
      keysEnvPrefix: 'ALE_API_KEY',
      headerName: 'x-api-key',
      hashed: false,
    }),
    IngestionModule,
    MasterDataModule,
    OrchestratorModule,
  ],
  providers: [SystemHealthCheck],
})
export class AppModule {}
