import { Module } from '@nitrostack/core';
import { ComplianceService } from './compliance.service.js';
import { ComplianceTools } from './compliance.tools.js';
import { AnalyticsModule } from '../analytics/analytics.module.js';

@Module({
  name: 'compliance',
  imports: [AnalyticsModule], // for DatabaseService
  providers: [ComplianceService],
  controllers: [ComplianceTools],
  exports: [ComplianceService, ComplianceTools],
})
export class ComplianceModule {}
