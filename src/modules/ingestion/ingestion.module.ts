import { Module } from '@nitrostack/core';
import { IngestionTools } from './ingestion.tools.js';
import { IngestionExceptionFilter } from './ingestion.exception.filter.js';
import { ClaudeClient } from '../../shared/claude.client.js';
import { ApiKeyGuard } from '../../shared/api-key.guard.js';

/**
 * IngestionModule — Document ingestion subsystem.
 *
 * Provides:
 *   • IngestionTools             — MCP controller (tools + resource) for classify / extract / ingest
 *   • IngestionExceptionFilter   — Structured error mapper for ingestion tools
 *
 * Depends on:
 *   • ClaudeClient               — Anthropic API wrapper (singleton)
 *   • ApiKeyGuard                — x-api-key authentication guard
 *
 * Exports:
 *   • IngestionTools             — so OrchestratorModule can call classify/extract programmatically
 */
@Module({
  name: 'ingestion',
  description: 'Document ingestion — classify, extract, and pipeline tools',
  controllers: [IngestionTools],
  providers: [
    ClaudeClient,
    ApiKeyGuard,
    IngestionExceptionFilter,
  ],
  exports: [IngestionTools],
})
export class IngestionModule {}
