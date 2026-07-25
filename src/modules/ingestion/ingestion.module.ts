import { Module } from '@nitrostack/core';
import { IngestionTools } from './ingestion.tools.js';
import { ClaudeClient } from '../../shared/claude.client.js';

@Module({
  providers: [ClaudeClient, IngestionTools],
  exports: [],
})
export class IngestionModule {}
