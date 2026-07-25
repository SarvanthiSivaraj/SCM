import { Module } from '@nitrostack/core';
import { IngestionTools } from './ingestion.tools.js';
import { ClaudeClient } from '../../shared/claude.client.js';

@Module({
  name: 'ingestion',
  providers: [ClaudeClient, IngestionTools],
  exports: [],
})
export class IngestionModule {}
