import { Injectable } from '@nitrostack/core';
import { DatabaseService } from '../../shared/database.service.js';

export interface ScreeningResult {
  status: 'CLEAN' | 'FLAGGED' | 'BLOCKED';
  matches: Array<{
    entity_name: string;
    reason: string;
  }>;
}

@Injectable()
export class ComplianceService {
  constructor(private readonly database: DatabaseService) {}

  /**
   * Checks if a vendor is on the denied parties list.
   * Performs an exact match for demonstration, could be expanded to fuzzy matching.
   */
  async screenVendor(vendorName: string): Promise<ScreeningResult> {
    const query = `SELECT entity_name, reason FROM denied_parties WHERE LOWER(entity_name) = LOWER(?)`;
    const results = (await this.database.sql(query, vendorName)) as Array<{ entity_name: string; reason: string }>;
    
    if (results.length > 0) {
      return {
        status: 'BLOCKED',
        matches: results,
      };
    }
    
    return {
      status: 'CLEAN',
      matches: [],
    };
  }
}
